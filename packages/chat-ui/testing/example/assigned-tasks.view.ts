import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { AssignedTasksScreenDef } from 'dmg-ui/testing';
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
