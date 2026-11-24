import { type AnyUiAppDef, ModuleRegistries } from 'dmg-ui';
import { AppChatViews } from 'dmg-ui/chat-ui';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { todoChatViews } from './todo-chat.views';
import { usersChatViews } from './users-chat.views';

/**
 * Сборка представлений учебного примера в диалоговом канале: без `app` —
 * набора целиком (превью, граф), с `app` — приложения из реестров его модулей.
 */
export const exampleDialogViews = (app?: AnyUiAppDef): AppChatViews => {
  const modules = [todoChatViews, usersChatViews];
  if (app === undefined) return AppChatViews.ofSet(ExampleUiSetDef, modules);
  const required = ModuleRegistries.required(app);
  return AppChatViews.of(
    app,
    modules.filter(({ module }) => required.includes(module)),
  );
};
