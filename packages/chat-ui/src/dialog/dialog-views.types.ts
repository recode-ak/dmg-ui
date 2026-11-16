import type {
  AnyNotificationDef,
  AnyScreenDef,
  InstanceView,
  NotificationDataOf,
  ScreenViewOf,
} from 'dmg-ui';

/** Текст тела экрана по его виду в типах экрана. */
export type ScreenRender<D extends AnyScreenDef> = (
  view: ScreenViewOf<D>,
) => string;

/** Текст уведомления по его данным. */
export type NotificationRender<D extends AnyNotificationDef> = (
  data: NotificationDataOf<D>,
) => string;

/** Свои тексты отказов экрана по коду ошибки из `catches`. */
export type CaughtTexts = Readonly<Record<string, string>>;

/** Представление экрана без генерика — так его хранит реестр. */
export type AnyScreenPresenter = {
  readonly def: AnyScreenDef;
  text(view: InstanceView): string;
  caught(code: string): string | undefined;
};

/** Представление уведомления без генерика — так его хранит реестр. */
export type AnyNotificationPresenter = {
  readonly def: AnyNotificationDef;
  text(data: unknown): string;
};
