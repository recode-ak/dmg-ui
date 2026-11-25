import type { ExampleUser } from 'dmg-core/testing/example';
import type { ScreenCode } from 'dmg-ui';
import type { UserCardScreenDef } from '../../../platform/ui';

/**
 * Подмена кода карточки пользователя (тесты); без поля — код примера.
 * Субъект кода — пользователь учебного приложения (`ExampleUser`).
 */
export type UsersCodeOverrides = {
  readonly user?: ScreenCode<typeof UserCardScreenDef, ExampleUser>;
};
