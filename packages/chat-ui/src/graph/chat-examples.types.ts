import type {
  AnyUiSetDef,
  CodeLoaders,
  InstanceView,
  RenderContext,
} from 'dmg-ui';

/** Сборка примеров: набор, загрузчики его кода, контекст рендера (по умолчанию — `CHAT_EXAMPLES_CONTEXT`). */
export type ChatExamplesSpec = {
  readonly set: AnyUiSetDef;
  readonly codes: CodeLoaders;
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
