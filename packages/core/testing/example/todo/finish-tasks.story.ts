import { StoryDef } from 'dmg-ui';
import { TaskCardScreenDef } from './task-card.screen';
import { TaskListScreenDef } from './task-list.screen';

/** Сторис «Выполнение задач»: тот же список и карточка задачи. */
export const FinishTasksStoryDef = StoryDef.define({
  name: 'finishTasks',
  label: 'Выполнение задач',
  description: 'Пользователь отмечает задачи выполненными.',
  callers: ['user'],
  goal: 'чтобы закрыть сделанное',
  start: TaskListScreenDef,
  screens: [TaskListScreenDef, TaskCardScreenDef],
  outcomes: {
    created: {
      label: 'Задача добавлена',
      description: 'По ходу выполнения в списке появилась новая задача.',
      exits: [TaskListScreenDef.exits.created],
    },
    closed: {
      label: 'Список закрыт',
      description: 'Пользователь закончил с задачами.',
      exits: [TaskListScreenDef.exits.closed],
    },
  },
});
