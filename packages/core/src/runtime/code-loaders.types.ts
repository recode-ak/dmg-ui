import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { NotificationCode } from './notification-code';
import type { AnyScreenUnit } from './screen-unit.types';

/** Что грузит загрузчик: юнит экрана или код уведомления. */
export type CodeTarget =
  | {
      readonly kind: 'screen';
      readonly def: AnyScreenDef;
      readonly make: () => Promise<AnyScreenUnit>;
    }
  | {
      readonly kind: 'notification';
      readonly def: AnyNotificationDef;
      readonly make: () => Promise<NotificationCode<AnyNotificationDef>>;
    };
