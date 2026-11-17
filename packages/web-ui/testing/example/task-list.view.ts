import { TaskListScreenDef } from 'dmg-ui/testing';
import { PagePresenter } from 'dmg-ui/web-ui';
import { TaskLines } from './task-lines';

/** Список задач на странице: задачи с отметкой выбора. */
export const TaskListView = PagePresenter.for(
  TaskListScreenDef,
  ({ data, state }) =>
    new TaskLines(data?.tasks ?? [], state?.selected ?? []).text(
      'Задач пока нет.',
    ),
);
