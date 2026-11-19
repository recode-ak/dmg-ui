import { UserCardScreenDef } from 'dmg-ui/testing';
import { PagePresenter } from 'dmg-ui/web-ui';

/** Карточка пользователя на странице: активна ли учётная запись. */
export const UserCardView = PagePresenter.for(UserCardScreenDef, ({ data }) =>
  data === undefined
    ? ''
    : data.active
      ? 'Учётная запись активна'
      : 'Учётная запись не активна',
);
