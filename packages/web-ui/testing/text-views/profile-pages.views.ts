import { ProfileUiModuleDef } from 'dmg-ui/example';
import { PageViews } from 'dmg-ui/web-ui';
import { ProfileSummaryView } from './profile-summary.view';

/** Представления модуля `profile` учебного примера на страницах. */
export const profilePagesViews = PageViews.of(ProfileUiModuleDef, [
  ProfileSummaryView,
]);
