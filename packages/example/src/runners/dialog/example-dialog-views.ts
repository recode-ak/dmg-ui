import { type AnyUiAppDef, ModuleRegistries } from 'dmg-ui';
import { AppChatViews } from 'dmg-ui/chat-ui';
import { profileChatViews } from '../../frontend/profile/chat';
import { todoChatViews } from '../../frontend/todo/chat';
import { usersChatViews } from '../../frontend/users/chat';
import { ExampleUiSetDef } from '../../platform/ui';

/**
 * Сборка представлений учебного примера в диалоговом канале: без `app` —
 * набора целиком (превью, граф), с `app` — приложения из реестров его модулей.
 */
export const exampleDialogViews = (app?: AnyUiAppDef): AppChatViews => {
  const modules = [todoChatViews, usersChatViews, profileChatViews];
  if (app === undefined) return AppChatViews.ofSet(ExampleUiSetDef, modules);
  const required = ModuleRegistries.required(app);
  return AppChatViews.of(
    app,
    modules.filter(({ module }) => required.includes(module)),
  );
};
