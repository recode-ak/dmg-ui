import { type AnyUiAppDef, ModuleRegistries } from 'dmg-ui';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { AppPageViews } from 'dmg-ui/web-ui';
import { todoPagesViews } from './todo-pages.views';
import { usersPagesViews } from './users-pages.views';

/**
 * Сборка представлений учебного примера на страницах: без `app` — набора
 * целиком (превью, граф), с `app` — приложения из реестров его модулей.
 */
export const examplePagesViews = (app?: AnyUiAppDef): AppPageViews => {
  const modules = [todoPagesViews, usersPagesViews];
  if (app === undefined) return AppPageViews.ofSet(ExampleUiSetDef, modules);
  const required = ModuleRegistries.required(app);
  return AppPageViews.of(
    app,
    modules.filter(({ module }) => required.includes(module)),
  );
};
