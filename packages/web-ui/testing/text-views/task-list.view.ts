import { TaskLines, TaskListScreenDef } from 'dmg-ui/example';
import { PagePresenter } from 'dmg-ui/web-ui';

/** Список задач на странице: задачи с отметкой выбора. */
export const TaskListView = PagePresenter.for(
  TaskListScreenDef,
  ({ data, state }) =>
    new TaskLines(data?.tasks ?? [], state?.selected ?? []).text(
      'Задач пока нет.',
    ),
);
