import { err, type Identified, ok, type Result, Trace } from 'dmg-core';
import type { RenderContext } from 'dmg-ui';
import { type CallerSource, RenderFlags } from 'dmg-ui/server';
import * as v from 'valibot';
import { PAGE_CHANNEL } from '../page-channel.const';
import { PageId } from '../wire/page-messages';
import type { ServerMessage } from '../wire/page-messages.types';
import type { PageServerPort, ServerLink } from '../wire/page-wire.types';
import { PageConnection } from './page-connection';
import { PageDelivery } from './page-delivery';
import type { PageHostSpec, PagePlace } from './page-server.types';

export type {
  PageHostSpec,
  PageLogger,
  PagePlace,
} from './page-server.types';

/** Место личности по умолчанию. */
const DEFAULT_PLACE: PagePlace = { locale: 'ru-RU', timeZone: 'Asia/Oral' };

/**
 * Серверная половина страничного канала: держит `UiServer`, экранов не
 * исполняет. Соединение — по токену: токен → `uuid` → сессия сервера →
 * `PageConnection` и `hello` с контекстом рендера (один раз на соединение,
 * Т-7). Уведомления `UiNotifier` отдаёт в `delivery`.
 *
 * Допущения учебного канала: токен живёт всё соединение — отзыв токена
 * открытое соединение не рвёт; признаки заместителя в `hello` — на момент
 * соединения (устаревшие влияют только на вид: команду всё равно сверяет
 * `dmg-core`).
 */
export class PageHost<U extends Identified> implements PageServerPort {
  readonly delivery = new PageDelivery();

  /** Приложение другого канала — ошибка сборки, бросок. */
  constructor(private readonly spec: PageHostSpec<U>) {
    if (spec.app.channel !== PAGE_CHANNEL) {
      throw new Error(
        `PageHost: приложение ${spec.app.name} канала ${spec.app.channel}, а не ${PAGE_CHANNEL}`,
      );
    }
  }

  /** Токен не по схеме или неизвестен — `refused`, клиенту ничего не отправлено. */
  async connect(
    token: string,
    push: (message: ServerMessage) => void,
  ): Promise<Result<ServerLink, 'refused'>> {
    if (!v.is(PageId, token)) return err('refused');
    const uuid = this.spec.tokens(token);
    if (uuid === undefined) return err('refused');
    const source = this.source(uuid);
    const context = await this.context(source);
    const connection = new PageConnection({
      session: this.spec.server.session(source),
      push,
      logger: this.spec.logger,
      source: PAGE_CHANNEL,
    });
    this.delivery.attach(uuid, connection);
    push({ kind: 'hello', context });
    return ok({
      receive: (raw) => connection.receive(raw),
      close: () => {
        this.delivery.detach(uuid, connection);
        connection.close();
      },
    });
  }

  /** Источник вызывающего сессии: личность — из токена, канал следа — страничный. */
  private source(uuid: string): CallerSource<U> {
    const callers = this.spec.identities(uuid);
    return {
      subjectId: uuid,
      channel: { name: PAGE_CHANNEL },
      resolve: (trace) => callers.resolve(uuid, trace),
    };
  }

  /**
   * Контекст рендера соединения. Вызывающий не разрешился — признаков нет:
   * вызовы UC той же личности сервер всё равно отклонит (как у диалога).
   */
  private async context(source: CallerSource<U>): Promise<RenderContext> {
    // Id запроса соединения создаёт сервер: признак `generated` честен,
    // предупреждать не о чем.
    const trace = Trace.fromRequest({ channel: source.channel }, () => {});
    const caller = await source.resolve(trace);
    const flags = caller.ok
      ? RenderFlags.of(caller.value)
      : { delegate: false, readOnly: false };
    const place = this.spec.place ?? DEFAULT_PLACE;
    return {
      locale: place.locale,
      timeZone: place.timeZone,
      delegate: flags.delegate,
      readOnly: flags.readOnly,
    };
  }
}
