import { PagePresenter } from '../../page/client/page-views';
import { AssignedTasksScreenDef } from '../todo/assigned-tasks.screen';
import { TaskLines } from './task-lines';

/** «Назначенные мне» на странице: поручения со статусом. */
export const AssignedTasksView = PagePresenter.for(
  AssignedTasksScreenDef,
  ({ data }) =>
    new TaskLines(data?.tasks ?? [], undefined).text('Поручений нет.'),
);
