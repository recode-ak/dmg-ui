import type {
  AnyUiSetDef,
  CodeLoaders,
  InstanceView,
  NotificationPreview,
  RenderContext,
} from 'dmg-ui';

/** Порт помощника: представление канала — вид и уведомление в текст. */
export type ExampleRenderer = {
  screen(view: InstanceView): string;
  notification(notification: NotificationPreview): string;
};

/** Сборка `ExamplePreview`: набор, код, рендерер канала и контекст рендера. */
export type ExamplePreviewSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: CodeLoaders;
  readonly renderer: ExampleRenderer;
  /** По умолчанию — `ru-RU`, `Asia/Oral`, без заместителя. */
  readonly context?: RenderContext;
};
