import { type AnyUiAppDef, ModuleRegistries } from 'dmg-ui';
import { profileWebViews } from '../../frontend/profile/web';
import { todoWebViews } from '../../frontend/todo/web';
import { usersWebViews } from '../../frontend/users/web';
import { ExampleUiSetDef } from '../../platform/ui';
import { AppExampleViews } from './view/app-example-views';

/**
 * Сборка представлений примера на DOM: без `app` — набора целиком (граф,
 * кадр области), с `app` — приложения из реестров его модулей.
 */
export const exampleWebViews = (app?: AnyUiAppDef): AppExampleViews => {
  const modules = [todoWebViews, usersWebViews, profileWebViews];
  if (app === undefined) return AppExampleViews.ofSet(ExampleUiSetDef, modules);
  const required = ModuleRegistries.required(app);
  return AppExampleViews.of(
    app,
    modules.filter(({ module }) => required.includes(module)),
  );
};
