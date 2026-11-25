import { UserCardScreenDef } from '../../../../platform/ui';
import { ExampleScreenView } from '../../../web-kit/example-screen-view';
import { USER_TEXTS } from '../../../web-kit/view-texts.const';

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
