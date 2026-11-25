import { CodeLoader, CodeLoaders } from 'dmg-ui';
import {
  ProfileSummaryScreenDef,
  ProfileUiModuleDef,
} from '../../../platform/ui';
import type { ProfileCodeOverrides } from './profile-codes.types';

/** Реестр кода модуля `profile` примера; `over` подменяет код профиля. */
export const profileCodes = (over: ProfileCodeOverrides = {}): CodeLoaders =>
  CodeLoaders.of(ProfileUiModuleDef, [
    CodeLoader.screen(
      ProfileSummaryScreenDef,
      async () =>
        over.profile ??
        new (
          await import('./check-profile/profile-summary.scode')
        ).ProfileSummaryScreenCode(),
    ),
  ]);
