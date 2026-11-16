import { PagePresenter } from '../../page/client/page-views';
import { TaskListScreenDef } from '../todo/task-list.screen';
import { TaskLines } from './task-lines';

/** Список задач на странице: задачи с отметкой выбора. */
export const TaskListView = PagePresenter.for(
  TaskListScreenDef,
  ({ data, state }) =>
    new TaskLines(data?.tasks ?? [], state?.selected ?? []).text(
      'Задач пока нет.',
    ),
);
