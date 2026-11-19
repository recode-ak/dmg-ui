import { MainMenuScreenDef } from 'dmg-ui/testing';
import { PagePresenter } from 'dmg-ui/web-ui';

/**
 * Меню «Начать работу» на странице: данных нет, заголовок области даёт
 * страница, переходы — действиями экрана; своего текста у меню нет.
 */
export const MainMenuView = PagePresenter.for(MainMenuScreenDef, () => '');
