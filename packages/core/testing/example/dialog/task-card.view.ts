import { ScreenPresenter } from '../../dialog';
import { TaskCardScreenDef } from '../todo/task-card.screen';

/** Карточка задачи в диалоге: название и статус. */
export const TaskCardView = ScreenPresenter.for(
  TaskCardScreenDef,
  ({ data }) =>
    data === undefined
      ? TaskCardScreenDef.label
      : [
          `${TaskCardScreenDef.label}: ${data.title}`,
          data.status === 'done' ? 'Статус: выполнена' : 'Статус: открыта',
        ].join('\n'),
);
