import { MainMenuScreenDef } from 'dmg-ui/testing';
import { ExampleScreenView } from './example-screen-view';

/** «Начать работу»: заголовок области, без управления — переходов меню пример пока не рисует. */
export const MainMenuView = ExampleScreenView.for(MainMenuScreenDef, () => ({
  kind: 'menu',
}));
