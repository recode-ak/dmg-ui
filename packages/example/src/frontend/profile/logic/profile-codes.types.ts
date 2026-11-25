import type { ExampleUser } from 'dmg-core/testing/example';
import type { ScreenCode } from 'dmg-ui';
import type { ProfileSummaryScreenDef } from '../../../platform/ui';

/**
 * Подмена кода профиля (тесты); без поля — код примера. Субъект кода —
 * пользователь учебного приложения (`ExampleUser`).
 */
export type ProfileCodeOverrides = {
  readonly profile?: ScreenCode<typeof ProfileSummaryScreenDef, ExampleUser>;
};
