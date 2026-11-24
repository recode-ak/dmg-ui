import { type AnyUiAppDef, ModuleRegistries } from 'dmg-ui';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { AppExampleViews } from './app-example-views';
import { todoWebViews } from './todo-web.views';
import { usersWebViews } from './users-web.views';

/**
 * Сборка представлений примера на DOM: без `app` — набора целиком (граф,
 * кадр области), с `app` — приложения из реестров его модулей.
 */
export const exampleWebViews = (app?: AnyUiAppDef): AppExampleViews => {
  const modules = [todoWebViews, usersWebViews];
  if (app === undefined) return AppExampleViews.ofSet(ExampleUiSetDef, modules);
  const required = ModuleRegistries.required(app);
  return AppExampleViews.of(
    app,
    modules.filter(({ module }) => required.includes(module)),
  );
};
