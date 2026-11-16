import { StoryDef } from 'dmg-ui';
import { TaskListScreenDef } from './task-list.screen';

/** Сторис «Планирование задач»: список — общий экран с `finishTasks`. */
export const PlanTasksStoryDef = StoryDef.define({
  name: 'planTasks',
  label: 'Планирование задач',
  description: 'Пользователь добавляет задачи в список.',
  callers: ['user'],
  goal: 'чтобы не забыть дела',
  start: TaskListScreenDef,
  screens: [TaskListScreenDef],
  outcomes: {
    created: {
      label: 'Задача добавлена',
      description: 'В списке появилась новая задача.',
      exits: [TaskListScreenDef.exits.created],
    },
    closed: {
      label: 'Список закрыт',
      description: 'Пользователь закрыл список, не добавив задачу.',
      exits: [TaskListScreenDef.exits.closed],
    },
  },
});
