import { ScreenPresenter } from '../../dialog';
import { AssignedTasksScreenDef } from '../todo/assigned-tasks.screen';
import { TaskLines } from './task-lines';

/** «Назначенные мне» в диалоге: поручения со статусом. */
export const AssignedTasksView = ScreenPresenter.for(
  AssignedTasksScreenDef,
  ({ data }) =>
    [
      AssignedTasksScreenDef.label,
      new TaskLines(data?.tasks ?? [], undefined).text('Поручений нет.'),
    ].join('\n'),
);
