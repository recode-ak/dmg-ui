import { type AnyScreenDef, ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { AssignedTasksScreenDef } from '../follow-assigned/assigned-tasks.screen';
import { TaskListScreenDef } from '../shared/task-list.screen';

/**
 * Меню «Начать работу»: корень набора, ведёт в сторис задач. Чтений и данных
 * нет — только переходы и выход.
 */
export const MainMenuScreenDef = ScreenDef.define({
  name: 'mainMenu',
  label: 'Начать работу',
  description: 'Меню: свои задачи и поручения.',
  hint: 'Отсюда начинается работа: выберите раздел',
  reads: [],
  data: v.object({}),
  actions: {
    tasks: {
      label: 'Мои задачи',
      description: 'Список своих задач с первой страницы.',
      to: (): readonly AnyScreenDef[] => [TaskListScreenDef],
    },
    assigned: {
      label: 'Назначенные мне',
      description: 'Задачи, которые поручили вызывающему.',
      to: (): readonly AnyScreenDef[] => [AssignedTasksScreenDef],
    },
    close: {
      label: 'Закрыть',
      description: 'Закончить работу.',
    },
  },
  exits: {
    closed: {
      label: 'Работа закончена',
      description: 'Пользователь закрыл меню.',
    },
  },
  examples: {
    start: {
      label: 'Меню',
      description: 'Меню без данных: три действия.',
      params: {},
      data: {},
    },
  },
});
