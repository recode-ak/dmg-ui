import {
  type DomainError,
  type Identified,
  ok,
  type Result,
  type TraceJson,
} from 'dmg-core';
import { type EventEnvelope, EventSubscriber, type Trace } from 'dmg-core/app';
import { AddressCodec } from '../address/address-codec';
import { UiIds } from '../address/ui-ids';
import type { AnyNotificationDef } from '../manifest/notification-def.types';
import { DeclaredReads } from '../runtime/declared-reads';
import { SchemaCheck } from '../schema/schema-check';
import { RecipientList } from './recipient-list';
import type { DeliveredNotification, UiNotifierSpec } from './server.types';
import { ServerCalls } from './server-calls';
import { UcRoutes } from './uc-routes';

/**
 * Уведомления одного приложения UI: подписка на события его уведомлений,
 * на каждого получателя — данные от его имени со следом события, ссылки
 * только из `links()`, доставка каналу. Записи наблюдателя — без payload.
 */
export class UiNotifier<U extends Identified> {
  private readonly spec: UiNotifierSpec<U>;
  private readonly name: string;
  private readonly ids: UiIds;
  private readonly codec: AddressCodec;
  private readonly calls: ServerCalls<U>;
  private readonly recipients: RecipientList<U>;
  private readonly subscriber: EventSubscriber;

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
    const routes = new UcRoutes({
      set: app.set,
      nodes: [],
      logger: context.logger,
      source: this.name,
    });
    this.calls = new ServerCalls({
      routes,
      dispatch,
      logger: context.logger,
      source: this.name,
    });
    this.recipients = new RecipientList({ set: app.set, dispatch });
    this.subscriber = new EventSubscriber(context, this.name);
  }

  /** Подписывает уведомления приложения; возвращает отписку всех. */
  start(): () => void {
    for (const def of this.spec.app.notifications) {
      this.subscriber.on(def.event, (envelope, trace) =>
        this.notify(def, envelope, trace),
      );
    }
    return () => this.subscriber.close();
  }

  private async notify(
    def: AnyNotificationDef,
    envelope: EventEnvelope,
    trace: Trace,
  ): Promise<void> {
    const node = this.ids.notification(def);
    const json = trace.toJSON();
    const recipients = await this.guard(node, json, () =>
      this.recipients.of(def, envelope.payload, trace),
    );
    if (recipients === undefined) return;
    for (const recipient of recipients) {
      const built = await this.guard(node, json, () =>
        this.build(def, node, recipient, envelope, trace),
      );
      if (built !== undefined) await this.deliver(built, envelope);
    }
  }

  /**
   * Уведомление получателю: вызывающий, данные по схеме, ссылки. Отказ —
   * `err` (запись `refused`); дефект кода — бросок (запись `defect`).
   */
  private async build(
    def: AnyNotificationDef,
    node: string,
    recipient: string,
    envelope: EventEnvelope,
    trace: Trace,
  ): Promise<Result<DeliveredNotification, DomainError>> {
    const caller = await this.spec.callers.resolve(recipient, trace);
    if (!caller.ok) return caller;
    const json = trace.toJSON();
    const code = await this.spec.codes.notification(def);
    const { read } = new DeclaredReads({
      owner: `Уведомление ${def.name}`,
      node,
      reads: def.reads,
      ucs: { call: (call) => this.calls.call(call, async () => caller) },
      trace: json,
    });
    const loaded = await code.load({ payload: envelope.payload, read });
    if (!loaded.ok) return loaded;
    const data = new SchemaCheck(def.data).run(loaded.value);
    if (!data.ok) {
      const fields = [...new Set(data.error.flatMap((i) => i.field ?? []))];
      throw new Error(
        `Уведомление ${def.name}: данные не по схеме (поля: ${fields.join(', ')})`,
      );
    }
    const links = code.links?.(data.value, envelope.payload) ?? [];
    const allowed = def.links();
    for (const link of links) {
      if (!allowed.includes(link.screen)) {
        throw new Error(
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

  /** Доставка каналу; сбой — `logger.error` без данных уведомления. */
  private async deliver(
    notification: DeliveredNotification,
    envelope: EventEnvelope,
  ): Promise<void> {
    const { notification: node, recipient, trace } = notification;
    try {
      await this.spec.delivery.deliver(notification);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      this.spec.context.logger.error(
        this.name,
        'доставка уведомления не удалась',
        {
          notification: node,
          event: envelope.name,
          eventId: envelope.eventId,
          error: text,
        },
      );
      return;
    }
    this.spec.observer.record({
      kind: 'notified',
      node,
      trace,
      recipient,
      eventId: envelope.eventId,
    });
  }

  /** Отказ — запись `refused`, бросок — `defect`; в обоих случаях `undefined`. */
  private async guard<T>(
    node: string,
    trace: TraceJson,
    run: () => Promise<Result<T, DomainError>>,
  ): Promise<T | undefined> {
    const { observer } = this.spec;
    try {
      const result = await run();
      if (result.ok) return result.value;
      const { code } = result.error;
      observer.record({ kind: 'refused', node, trace, code, caught: false });
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : String(cause);
      observer.record({ kind: 'defect', node, trace, text });
    }
    return undefined;
  }
}
