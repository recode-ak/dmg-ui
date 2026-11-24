import type {
  AnyUiSetDef,
  AppCodeLoaders,
  InstanceView,
  RenderContext,
} from 'dmg-ui';

/** Сборка примеров: набор, сборка кода этого набора, контекст рендера (по умолчанию — `CHAT_EXAMPLES_CONTEXT`). */
export type ChatExamplesSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: AppCodeLoaders;
  readonly context?: RenderContext;
};

/** Вид экрана по примеру: `id` экрана из `UiIds`, имя примера. */
export type ChatScreenExample = {
  readonly id: string;
  readonly name: string;
  readonly view: InstanceView;
};

/** Данные уведомления по примеру: `id` уведомления из `UiIds`, имя примера. */
export type ChatNotificationExample = {
  readonly id: string;
  readonly name: string;
  readonly data: unknown;
};
