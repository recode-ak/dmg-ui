import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { ProfileSummaryScreenDef } from '../../../../platform/ui';
import { AccountStatus } from '../../../users/chat/public';

/** Профиль в диалоге: заголовок и состояние своей учётной записи. */
export const ProfileSummaryView = ScreenPresenter.for(
  ProfileSummaryScreenDef,
  ({ data }) =>
    data === undefined
      ? ProfileSummaryScreenDef.label
      : [ProfileSummaryScreenDef.label, AccountStatus.line(data.active)].join(
          '\n',
        ),
);
