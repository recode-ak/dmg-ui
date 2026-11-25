import { ProfileSummaryScreenDef } from '../../../../platform/ui';
import { ExampleScreenView } from '../../../web-kit/example-screen-view';
import { USER_TEXTS } from '../../../web-kit/view-texts.const';

/** «Мой профиль»: учётная запись и её активность, без управления. */
export const ProfileSummaryView = ExampleScreenView.for(
  ProfileSummaryScreenDef,
  (view) => ({
    kind: 'user',
    userId: view.data?.userId ?? '',
    status:
      view.data?.active === true ? USER_TEXTS.active : USER_TEXTS.inactive,
  }),
);
