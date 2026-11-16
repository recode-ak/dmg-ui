import type { Trace, TraceJson } from 'dmg-core';
import type { EventEnvelope } from 'dmg-core/app';
import type { AnyNotificationDef } from '../manifest/notification-def.types';

/** Одно событие одного уведомления: что и по какому следу уведомить. */
export type NotifyEvent = {
  readonly def: AnyNotificationDef;
  /** `id` уведомления в графе. */
  readonly node: string;
  readonly envelope: EventEnvelope;
  readonly trace: Trace;
  readonly json: TraceJson;
};
