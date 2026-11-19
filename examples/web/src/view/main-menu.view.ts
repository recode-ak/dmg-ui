import { MainMenuScreenDef } from 'dmg-ui/testing';
import { ExampleScreenView } from './example-screen-view';

/** «Начать работу»: заголовок области и кнопки переходов меню. */
export const MainMenuView = ExampleScreenView.for(
  MainMenuScreenDef,
  (_view, controls) => ({
    kind: 'menu',
    ...controls,
  }),
);
