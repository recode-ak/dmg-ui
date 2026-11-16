import {
  CoreErrors,
  type DomainError,
  type Identified,
  ok,
  type Result,
} from 'dmg-core';
import { EventSubscriber } from 'dmg-core/app';
import { AddressCodec } from '../address/address-codec';
import { UiIds } from '../address/ui-ids';
import { DeclaredReads } from '../runtime/declared-reads';
import { UcCalls } from '../runtime/uc-calls';
import { SchemaCheck } from '../schema/schema-check';
import { CodeDefect } from '../screen/code-defect';
import { RecipientList } from './recipient-list';
import type { DeliveredNotification, UiNotifierSpec } from './server.types';
import { ServerCalls } from './server-calls';
import { UcRoutes } from './uc-routes';
import type { NotifyEvent } from './ui-notifier.types';

/**
 * Уведомления одного приложения UI: подписка на события его уведомлений,
 * на каждого получателя — данные от его имени со следом события, ссылки
 * только из `links()`, доставка каналу. В записях наблюдателя значений нет;
 * в лог payload не идёт, но `logger.error` несёт `message` чужого броска
 * (как подписка событий платформы).
 */
export class UiNotifier<U extends Identified> {
  private readonly spec: UiNotifierSpec<U>;
  private readonly name: string;
  private readonly ids: UiIds;
  private readonly codec: AddressCodec;
  private readonly calls: ServerCalls<U>;
  private readonly ucCalls: UcCalls;
  private readonly recipients: RecipientList<U>;
  private readonly subscriber: EventSubscriber;
  /** Отписка действующего запуска; `undefined` — не запущен. */
  private running: (() => void) | undefined;

  /** Загрузчики другого набора — ошибка сборки, бросок. */
  constructor(spec: UiNotifierSpec<U>) {
    const { app, codes, context, dispatch } = spec;
    if (codes.set !== app.set) {
      throw new Error(
        `UiNotifier: загрузчики кода набора ${codes.set.name}, а приложение ${app.name} — ${app.set.name}`,
      );
    }
    this.spec = spec;
    this.name = `ui:${app.set.name}`;
    this.ids = new UiIds(app.set);
    this.codec = new AddressCodec(app.set);
    const routes = UcRoutes.forNotifications({
      set: app.set,
      logger: context.logger,
      source: this.name,
    });
    this.calls = new ServerCalls({
      routes,
      dispatch,
      logger: context.logger,
      source: this.name,
    });
    this.ucCalls = new UcCalls(app.set);
    this.recipients = new RecipientList({ set: app.set, dispatch });
    this.subscriber = new EventSubscriber(context, this.name);
  }

  /**
   * Подписывает уведомления приложения; возвращает отписку. Повторный запуск
   * без остановки — бросок (иначе доставка удвоится).
   */
  start(): () => void {
    if (this.running !== undefined) {
      throw new Error(
        `UiNotifier: приложение ${this.spec.app.name} уже запущено`,
      );
    }
    const offs = this.spec.app.notifications.map((def) =>
      this.subscriber.on(def.event, (envelope, trace) =>
        this.notify({
          def,
          node: this.ids.notification(def),
          envelope,
          trace,
          json: trace.toJSON(),
        }),
      ),
    );
    const stop = () => {
      if (this.running !== stop) return;
      for (const off of offs) off();
      this.running = undefined;
    };
    this.running = stop;
    return stop;
  }

  private async notify(event: NotifyEvent): Promise<void> {
    const recipients = await this.recipientsOf(event);
    if (recipients === undefined) return;
    for (const recipient of recipients) {
      const built = await this.guard(event, () => this.build(event, recipient));
      if (built !== undefined) await this.deliver(event, built);
    }
  }

  /** Сбой бэкенда UC получателей — не дефект кода: `error` и `refused`. */
  private async recipientsOf(
    event: NotifyEvent,
  ): Promise<readonly string[] | undefined> {
    const { def, envelope, trace } = event;
    try {
      const found = await this.recipients.of(def, envelope.payload, trace);
      return this.accepted(event, found);
    } catch (error) {
      this.logError(event, 'сбой UC получателей уведомления', error);
      const { code } = CoreErrors.SERVER_INTERNAL.make();
      this.spec.observer.record({
        kind: 'refused',
        node: event.node,
        trace: event.json,
        code,
        caught: false,
      });
      return undefined;
    }
  }

  /**
   * Уведомление получателю: вызывающий, данные по схеме, ссылки. Отказ —
   * `err`; дефект кода — бросок (`CodeDefect` с текстом из имён).
   */
  private async build(
    { def, node, envelope, trace, json }: NotifyEvent,
    recipient: string,
  ): Promise<Result<DeliveredNotification, DomainError>> {
    const caller = await this.spec.callers.resolve(recipient, trace);
    if (!caller.ok) return caller;
    const code = await this.spec.codes.notification(def);
    // Внутренний путь: причина вызова — `eventId` события, след — его
    // настоящий след, а не собранный по причине.
    const { read } = new DeclaredReads({
      owner: `Уведомление ${def.name}`,
      calls: this.ucCalls,
      reads: def.reads,
      ucs: {
        call: (call) =>
          this.calls.call(call, {
            trace: () => trace,
            resolve: async () => caller,
          }),
      },
      trace: json,
    });
    const loaded = await code.load({ payload: envelope.payload, read });
    if (!loaded.ok) return loaded;
    const data = new SchemaCheck(def.data).run(loaded.value);
    if (!data.ok) {
      const fields = [...new Set(data.error.flatMap((i) => i.field ?? []))];
      throw new CodeDefect(
        `Уведомление ${def.name}: данные не по схеме (поля: ${fields.join(', ')})`,
      );
    }
    const links = code.links?.(data.value, envelope.payload) ?? [];
    const allowed = def.links();
    for (const link of links) {
      if (!allowed.includes(link.screen)) {
        throw new CodeDefect(
          `Уведомление ${def.name}: ссылка на экран ${link.screen.name} вне links()`,
        );
      }
    }
    return ok({
      notification: node,
      recipient,
      data: data.value,
      links: links.map((link) => this.codec.encode(link)),
      cause: { event: envelope.name, eventId: envelope.eventId },
      trace: json,
    });
  }

  /** Доставка каналу; сбой — `logger.error` с `message` броска канала. */
  private async deliver(
    event: NotifyEvent,
    notification: DeliveredNotification,
  ): Promise<void> {
    try {
      await this.spec.delivery.deliver(notification);
    } catch (error) {
      this.logError(event, 'доставка уведомления не удалась', error);
      return;
    }
    this.spec.observer.record({
      kind: 'notified',
      node: event.node,
      trace: event.json,
      recipient: notification.recipient,
      eventId: event.envelope.eventId,
    });
  }

  /** Бросок — запись `defect` с безопасным текстом и `logger.error`. */
  private async guard<T>(
    event: NotifyEvent,
    run: () => Promise<Result<T, DomainError>>,
  ): Promise<T | undefined> {
    try {
      return this.accepted(event, await run());
    } catch (error) {
      this.spec.observer.record({
        kind: 'defect',
        node: event.node,
        trace: event.json,
        text: CodeDefect.textOf(error, `уведомление ${event.def.name}`),
      });
      this.logError(event, 'дефект кода уведомления', error);
      return undefined;
    }
  }

  /** Отказ — запись `refused` и `logger.warn` с кодом. */
  private accepted<T>(
    event: NotifyEvent,
    result: Result<T, DomainError>,
  ): T | undefined {
    if (result.ok) return result.value;
    const { code } = result.error;
    const { node, json, envelope } = event;
    this.spec.observer.record({
      kind: 'refused',
      node,
      trace: json,
      code,
      caught: false,
    });
    this.spec.context.logger.warn(this.name, 'отказ уведомления', {
      notification: node,
      eventId: envelope.eventId,
      code,
    });
    return undefined;
  }

  /** Лог сбоя: узел и событие без payload; `message` броска — как есть. */
  private logError(event: NotifyEvent, text: string, error: unknown): void {
    const { node, envelope } = event;
    this.spec.context.logger.error(this.name, text, {
      notification: node,
      event: envelope.name,
      eventId: envelope.eventId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
