import { type AnyStoryDef, StoryDef } from 'dmg-ui';
import { FinishTasksStoryDef } from './finish-tasks.story';
import { FollowAssignedStoryDef } from './follow-assigned.story';
import { MainMenuScreenDef } from './main-menu.screen';
import { PlanTasksStoryDef } from './plan-tasks.story';

/** Сторис «Начать работу»: корень набора — из меню в сторис задач. */
export const StartWorkStoryDef = StoryDef.define({
  name: 'startWork',
  label: 'Начать работу',
  description: 'Пользователь выбирает, с чем работать.',
  hint: 'Выберите, с чем работать: со своими задачами или с поручениями',
  callers: ['user'],
  goal: 'чтобы перейти к своим задачам или поручениям',
  start: MainMenuScreenDef,
  screens: [MainMenuScreenDef],
  outcomes: {
    closed: {
      label: 'Работа закончена',
      description: 'Пользователь закрыл меню.',
      exits: [MainMenuScreenDef.exits.closed],
      after: 'home',
    },
  },
  leads: (): readonly AnyStoryDef[] => [
    PlanTasksStoryDef,
    FinishTasksStoryDef,
    FollowAssignedStoryDef,
  ],
});
