import type {
  AnyNotificationDef,
  AnyScreenDef,
  InstanceView,
  NotificationDataOf,
  ScreenViewOf,
} from 'dmg-ui';

/** Текст тела экрана по его виду в типах экрана. */
export type PageScreenRender<D extends AnyScreenDef> = (
  view: ScreenViewOf<D>,
) => string;

/** Текст уведомления по его данным. */
export type PageNoteRender<D extends AnyNotificationDef> = (
  data: NotificationDataOf<D>,
) => string;

/** Представление экрана без генерика — так его хранит реестр. */
export type AnyPagePresenter = {
  readonly def: AnyScreenDef;
  text(view: InstanceView): string;
};

/** Представление уведомления без генерика — так его хранит реестр. */
export type AnyPageNotePresenter = {
  readonly def: AnyNotificationDef;
  text(data: unknown): string;
};
