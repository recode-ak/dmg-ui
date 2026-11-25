import { UiModuleDef } from 'dmg-ui';
import { CheckProfileStoryDef } from './check-profile/check-profile.story';
import { ProfileSummaryScreenDef } from './check-profile/profile-summary.screen';

/** UI-модуль профиля: сводка своей учётной записи и сторис её проверки. */
export const ProfileUiModuleDef = UiModuleDef.define({
  name: 'profile',
  label: 'Профиль',
  description: 'Экран и сторис модуля профиля.',
  screens: [ProfileSummaryScreenDef],
  stories: [CheckProfileStoryDef],
});
