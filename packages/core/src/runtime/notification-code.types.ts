import type * as v from 'valibot';
import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { ReadPort } from '../screen/screen-code.types';

/** Данные уведомления — выход схемы `data`. */
export type NotificationDataOf<D extends AnyNotificationDef> = v.InferOutput<
  D['data']
>;

/** Вход загрузки уведомления: payload события и чтение от имени получателя. */
export type NotificationLoadContext<D extends AnyNotificationDef> = {
  readonly payload: unknown;
  readonly read: ReadPort<D>;
};
