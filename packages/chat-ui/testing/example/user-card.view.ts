import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { UserCardScreenDef } from 'dmg-ui/testing';

/** Карточка пользователя в диалоге: активна ли учётная запись. */
export const UserCardView = ScreenPresenter.for(
  UserCardScreenDef,
  ({ data }) =>
    data === undefined
      ? UserCardScreenDef.label
      : [
          UserCardScreenDef.label,
          data.active ? 'Учётная запись активна' : 'Учётная запись не активна',
        ].join('\n'),
);
