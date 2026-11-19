import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { MainMenuScreenDef } from 'dmg-ui/testing';

/** Меню «Начать работу» в диалоге: заголовок, переходы — вариантами действий. */
export const MainMenuView = ScreenPresenter.for(
  MainMenuScreenDef,
  () => MainMenuScreenDef.label,
);
