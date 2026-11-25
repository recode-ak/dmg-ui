import { type AnyUiAppDef, ModuleRegistries } from 'dmg-ui';
import { AppChatViews } from 'dmg-ui/chat-ui';
import { profileChatViews } from '../../frontend/profile/chat';
import { todoTelegramViews } from '../../frontend/todo/telegram';
import { usersChatViews } from '../../frontend/users/chat';
import { ExampleUiSetDef } from '../../platform/ui';

/**
 * Сборка представлений учебного примера под Telegram (D-UI-67): модуль
 * `todo` — с перекрытием списка и карточки, `users` и `profile` — общие. Без `app` —
 * набора целиком, с `app` — приложения из реестров его модулей.
 */
export const exampleTelegramViews = (app?: AnyUiAppDef): AppChatViews => {
  const modules = [todoTelegramViews, usersChatViews, profileChatViews];
  if (app === undefined) return AppChatViews.ofSet(ExampleUiSetDef, modules);
  const required = ModuleRegistries.required(app);
  return AppChatViews.of(
    app,
    modules.filter(({ module }) => required.includes(module)),
  );
};
