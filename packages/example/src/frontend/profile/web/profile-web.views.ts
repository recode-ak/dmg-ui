import { ProfileUiModuleDef } from '../../../platform/ui';
import { ExampleViews } from '../../web-kit/example-views';
import { ProfileSummaryView } from './check-profile/profile-summary.view';

/** Представления модуля `profile` примера на DOM. */
export const profileWebViews = ExampleViews.of(ProfileUiModuleDef, [
  ProfileSummaryView,
]);
