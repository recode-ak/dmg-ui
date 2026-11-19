import type { ScreenAction } from 'dmg-ui';
import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { MainMenuScreenDef } from 'dmg-ui/testing';

const ACTIONS = Object.values<ScreenAction>(MainMenuScreenDef.actions);

/**
 * Меню «Начать работу» в диалоге: заголовок и строка «подпись — подсказка» у
 * каждого действия с подсказкой в виде (у двери — подсказка сторис-цели);
 * переходы — вариантами действий.
 */
export const MainMenuView = ScreenPresenter.for(MainMenuScreenDef, (view) =>
  [
    MainMenuScreenDef.label,
    ...view.actions.flatMap(({ name, hint }) => {
      const action = ACTIONS.find((one) => one.name === name);
      return hint === undefined || action === undefined
        ? []
        : [`${action.label} — ${hint}`];
    }),
  ].join('\n'),
);
