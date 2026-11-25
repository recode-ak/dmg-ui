import { TaskRules } from 'dmg-core/testing/example';
import { StoryDef } from 'dmg-ui';
import { TaskListScreenDef } from '../shared/task-list.screen';

/**
 * Сторис «Планирование задач»: список — общий экран с `finishTasks`. Правило
 * лимита открытых задач — то же, что проверяет `createTask`.
 */
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
      after: TaskListScreenDef.at({ page: 0 }),
    },
    closed: {
      label: 'Список закрыт',
      description: 'Пользователь закрыл список, не добавив задачу.',
      exits: [TaskListScreenDef.exits.closed],
    },
  },
  rules: [TaskRules.rules.withinOpenLimit],
});
