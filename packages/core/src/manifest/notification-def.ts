import { type AnyEventDef, Def, type DefSchemas, toJsonSchema } from 'dmg-core';
import type {
  NormalizedNotification,
  NotificationExampleSpec,
  NotificationSpec,
  RecipientsSpec,
} from './notification-def.types';
import type { AnyScreenDef } from './screen-def.types';

export type {
  AnyNotificationDef,
  NormalizedNotification,
  NotificationExampleSpec,
  NotificationSpec,
  RecipientsSpec,
} from './notification-def.types';

/**
 * Манифест уведомления: кому и что сообщить по доменному событию. Данные
 * читаются от имени получателя (ФР-6).
 */
export class NotificationDef<
  const S extends NotificationSpec = NotificationSpec,
> extends Def<S['name']> {
  readonly dmg = 'notification';
  readonly event: AnyEventDef;
  readonly recipients: RecipientsSpec;
  readonly reads: S['reads'];
  readonly data: S['data'];
  readonly examples: Readonly<Record<string, NotificationExampleSpec>>;
  readonly links: () => readonly AnyScreenDef[];

  constructor(spec: S) {
    super(spec);
    this.event = spec.event;
    this.recipients = spec.recipients;
    this.reads = spec.reads;
    this.data = spec.data;
    this.examples = spec.examples ?? {};
    this.links = spec.links ?? (() => []);
  }

  static define<const S extends NotificationSpec>(spec: S): NotificationDef<S> {
    return new NotificationDef<S>(spec);
  }

  override schemas(): DefSchemas {
    return [['data', this.data]];
  }

  normalize(): NormalizedNotification {
    return {
      dmg: this.dmg,
      ...this.texts(),
      visible: this.visible,
      event: this.event.name,
      recipients: this.recipients,
      reads: this.reads.map((uc) => uc.name),
      data: toJsonSchema(this.data),
      links: this.links().map((s) => s.name),
      examples: Object.keys(this.examples),
    };
  }
}
