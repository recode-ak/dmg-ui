import { MainMenuScreenDef } from '../../../../platform/ui';
import { ExampleScreenView } from '../../../web-kit/example-screen-view';

/** «Начать работу»: заголовок области и кнопки переходов меню. */
export const MainMenuView = ExampleScreenView.for(
  MainMenuScreenDef,
  (_view, controls) => ({
    kind: 'menu',
    ...controls,
  }),
);
