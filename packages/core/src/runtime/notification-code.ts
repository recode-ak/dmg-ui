import type { DomainError, Result } from 'dmg-core';
import type { Address } from '../address/address';
import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type {
  NotificationDataOf,
  NotificationLoadContext,
} from './notification-code.types';

export type {
  NotificationDataOf,
  NotificationLoadContext,
} from './notification-code.types';

/**
 * Код уведомления: данные по payload события через `reads` уведомления и
 * ссылки на экраны из `links()`. Исполняет сервер — на каждого получателя
 * от его имени; данные не должны копировать payload.
 */
export abstract class NotificationCode<D extends AnyNotificationDef> {
  /** Данные уведомления; отказ чтения — `err`, доставки не будет. */
  abstract load(
    ctx: NotificationLoadContext<D>,
  ): Promise<Result<NotificationDataOf<D>, DomainError>>;

  /** Адреса экранов для перехода из уведомления; без метода — нет. */
  links?(data: NotificationDataOf<D>, payload: unknown): readonly Address[];
}
