import type {
  AnyUiSetDef,
  AppCodeLoaders,
  InstanceView,
  NotificationPreview,
  RenderContext,
} from 'dmg-ui';

/** Порт помощника: представление канала — вид и уведомление в текст. */
export type ExampleRenderer = {
  screen(view: InstanceView): string;
  notification(notification: NotificationPreview): string;
};

/**
 * Сборка `ExamplePreview`: набор, сборка кода того же набора, рендерер
 * канала и контекст рендера.
 */
export type ExamplePreviewSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: AppCodeLoaders;
  readonly renderer: ExampleRenderer;
  /** По умолчанию — `ru-RU`, `Asia/Oral`, без заместителя. */
  readonly context?: RenderContext;
};
