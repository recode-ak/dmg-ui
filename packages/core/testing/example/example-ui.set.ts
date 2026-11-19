import { ExampleAppDef } from 'dmg-core/testing/example';
import { UiSetDef } from 'dmg-ui';
import { TodoUiModuleDef } from './todo/todo.ui-module';
import { UsersUiModuleDef } from './users/users.ui-module';

/** Набор UI учебного примера поверх учебного приложения `dmg-core`. */
export const ExampleUiSetDef = UiSetDef.define({
  name: 'exampleUi',
  label: 'UI учебного приложения',
  description: 'Набор UI-модулей поверх учебного приложения.',
  app: ExampleAppDef,
  modules: [TodoUiModuleDef, UsersUiModuleDef],
});
