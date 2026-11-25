import { ProfileSummaryScreenDef } from 'dmg-ui/example';
import { PagePresenter } from 'dmg-ui/web-ui';

/** Профиль на странице: активна ли своя учётная запись. */
export const ProfileSummaryView = PagePresenter.for(
  ProfileSummaryScreenDef,
  ({ data }) =>
    data === undefined
      ? ''
      : data.active
        ? 'Учётная запись активна'
        : 'Учётная запись не активна',
);
