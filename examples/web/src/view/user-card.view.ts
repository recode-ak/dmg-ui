import { UserCardScreenDef } from 'dmg-ui/testing';
import { ExampleScreenView } from './example-screen-view';
import { USER_TEXTS } from './view-texts.const';

/** «Пользователь»: учётная запись и её активность, без управления. */
export const UserCardView = ExampleScreenView.for(
  UserCardScreenDef,
  (view) => ({
    kind: 'user',
    userId: view.data?.userId ?? '',
    status:
      view.data?.active === true ? USER_TEXTS.active : USER_TEXTS.inactive,
  }),
);
