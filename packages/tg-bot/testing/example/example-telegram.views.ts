import { type AnyUiAppDef, ModuleRegistries } from 'dmg-ui';
import { AppChatViews } from 'dmg-ui/chat-ui';
import { usersChatViews } from 'dmg-ui/chat-ui/testing';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { todoTelegramViews } from './todo-telegram.views';

/**
 * Сборка представлений учебного примера под Telegram (D-UI-67): модуль
 * `todo` — с перекрытием списка и карточки, `users` — общий. Без `app` —
 * набора целиком, с `app` — приложения из реестров его модулей.
 */
export const exampleTelegramViews = (app?: AnyUiAppDef): AppChatViews => {
  const modules = [todoTelegramViews, usersChatViews];
  if (app === undefined) return AppChatViews.ofSet(ExampleUiSetDef, modules);
  const required = ModuleRegistries.required(app);
  return AppChatViews.of(
    app,
    modules.filter(({ module }) => required.includes(module)),
  );
};
