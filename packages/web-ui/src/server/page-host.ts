import { err, type Identified, ok, type Result, Trace } from 'dmg-core';
import type { ViewContext } from 'dmg-ui';
import {
  type CallerContext,
  type CallerSource,
  RenderContexts,
} from 'dmg-ui/server';
import * as v from 'valibot';
import { PAGE_CHANNEL } from '../page-channel.const';
import { PageId } from '../wire/page-messages';
import type { HelloContext } from '../wire/page-messages.types';
import type { PageServerPort, ServerLink } from '../wire/page-wire.types';
import { PageConnection } from './page-connection';
import { PageDelivery } from './page-delivery';
import { PageOutbox } from './page-outbox';
import { CONNECTION_LIMIT, HOST_LOGS } from './page-server.const';
import type { PageHostSpec } from './page-server.types';

export type { PageHostSpec, PageLogger } from './page-server.types';

/**
 * Серверная половина страничного канала с личностью по токену и местом того,
 * кто работает (D-UI-41, D-UI-72). Держит `UiServer`, экранов не исполняет.
 * Соединение — токен → `uuid` → сессия → `PageConnection` и `hello` с
 * контекстом, место — из `PersonPlaces`. Уведомления — в `delivery`.
 * Допущения: отзыв токена открытое соединение не рвёт; признаки заместителя
 * в `hello` — на момент соединения.
 */
export class PageHost<U extends Identified> implements PageServerPort {
  readonly delivery = new PageDelivery();
  private readonly contexts: RenderContexts<U>;

  /** Приложение другого канала — ошибка сборки, бросок. */
  constructor(private readonly spec: PageHostSpec<U>) {
    if (spec.app.channel !== PAGE_CHANNEL) {
      throw new Error(
        `PageHost: приложение ${spec.app.name} канала ${spec.app.channel}, а не ${PAGE_CHANNEL}`,
      );
    }
    this.contexts = new RenderContexts(spec.callers, spec.places);
  }

  /**
   * Соединение по токену; сообщения клиенту — через `PageOutbox`, строкой с
   * пределом длины (D-UI-71). Токен не по схеме или неизвестен, сбой порта
   * личности или места, у личности уже `CONNECTION_LIMIT` соединений —
   * `refused`, клиенту ничего не отправлено. Контекст `hello` с переводом
   * субъекта собирается до `attach`: бросок перевода соединения не занимает.
   * После пуша `hello` — без `await`: связь отдаётся сразу.
   */
  async connect(
    token: string,
    push: (text: string) => void,
  ): Promise<Result<ServerLink, 'refused'>> {
    if (!v.is(PageId, token)) return err('refused');
    const uuid = await this.identify(token);
    if (uuid === undefined) return err('refused');
    const context = await this.context(uuid);
    if (context === undefined) return err('refused');
    const hello = this.wired(context);
    // Проверка — после последнего `await`: до `attach` соединений не прибудет.
    if (this.delivery.connections(uuid) >= CONNECTION_LIMIT) {
      return err('refused');
    }
    const outbox = new PageOutbox({
      send: push,
      logger: this.spec.logger,
      source: PAGE_CHANNEL,
    });
    const connection = new PageConnection({
      session: this.spec.server.session(this.source(uuid)),
      push: (message) => outbox.push(message),
      logger: this.spec.logger,
      source: PAGE_CHANNEL,
    });
    this.delivery.attach(uuid, connection);
    outbox.push({ kind: 'hello', context: hello });
    return ok({
      receive: (raw) => connection.receive(raw),
      close: () => {
        this.delivery.detach(uuid, connection);
        connection.close();
      },
    });
  }

  /**
   * `uuid` по токену; не узнал — `undefined`. Сбой порта — `error` без токена
   * и текста броска (ERR-07) и тоже `undefined`: соединение не открывается.
   */
  private async identify(token: string): Promise<string | undefined> {
    try {
      return await this.spec.tokens(token);
    } catch {
      this.spec.logger.error(PAGE_CHANNEL, HOST_LOGS.tokens);
      return undefined;
    }
  }

  /** Источник вызывающего сессии: личность — из токена, канал следа — страничный. */
  private source(uuid: string): CallerSource<U> {
    return {
      subjectId: uuid,
      channel: { name: PAGE_CHANNEL },
      resolve: (trace) => this.spec.callers.resolve(uuid, trace),
    };
  }

  /**
   * Контекст `hello` (D-UI-99): место и признаки; субъект — только в форме
   * `subjectToWire` проекта. Без перевода или без субъекта поля нет: объект
   * субъекта на провод не уходит. Бросок перевода — `error` без текста
   * броска (ERR-07) и `hello` без субъекта: действия по правам код экрана
   * скроет, сервер проверяет каждый вызов сам.
   */
  private wired(context: CallerContext<U>): HelloContext {
    const { locale, timeZone, delegate, readOnly, subject } = context;
    const view: ViewContext = { locale, timeZone, delegate, readOnly };
    const toWire = this.spec.subjectToWire;
    if (toWire === undefined || subject === undefined) return view;
    try {
      return { ...view, subject: toWire(subject) };
    } catch {
      this.spec.logger.error(PAGE_CHANNEL, HOST_LOGS.subject);
      return view;
    }
  }

  /**
   * Контекст рендера соединения — `RenderContexts` по `uuid` токена. Сбой
   * порта места или вызывающего — `error` без текста броска и `undefined`.
   */
  private async context(uuid: string): Promise<CallerContext<U> | undefined> {
    // Id запроса соединения создаёт сервер: признак `generated` честен,
    // предупреждать не о чем.
    const trace = Trace.fromRequest(
      { channel: { name: PAGE_CHANNEL } },
      () => {},
    );
    try {
      return await this.contexts.of(uuid, trace);
    } catch {
      this.spec.logger.error(PAGE_CHANNEL, HOST_LOGS.context);
      return undefined;
    }
  }
}
