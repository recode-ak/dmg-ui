import {
  type AnyUiAppDef,
  AppCodeLoaders,
  type CodeLoaders,
  ModuleRegistries,
} from 'dmg-ui';
import { todoCodes } from '../frontend/todo/logic';
import { usersCodes } from '../frontend/users/logic';
import { ExampleUiSetDef } from '../platform/ui';
import type { ExampleCodeOverrides } from './example-codes.types';

export type { ExampleCodeOverrides } from './example-codes.types';

/**
 * Сборка кода примера: без `app` — набора целиком (превью, исполнитель без
 * приложения), с `app` — приложения из реестров его модулей. Реестры
 * модулей свежие на каждый вызов; `over` подменяет код отдельных узлов.
 */
export const exampleCodes = (
  over: ExampleCodeOverrides = {},
  app?: AnyUiAppDef,
): AppCodeLoaders => {
  const modules: readonly CodeLoaders[] = [todoCodes(over), usersCodes(over)];
  if (app === undefined) return AppCodeLoaders.ofSet(ExampleUiSetDef, modules);
  const required = ModuleRegistries.required(app);
  return AppCodeLoaders.of(
    app,
    modules.filter(({ module }) => required.includes(module)),
  );
};
