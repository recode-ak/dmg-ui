import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { UserCardScreenDef } from '../../../../platform/ui';
import { AccountStatus } from '../shared/account-status';

/** Карточка пользователя в диалоге: активна ли учётная запись. */
export const UserCardView = ScreenPresenter.for(
  UserCardScreenDef,
  ({ data }) =>
    data === undefined
      ? UserCardScreenDef.label
      : [UserCardScreenDef.label, AccountStatus.line(data.active)].join('\n'),
);
