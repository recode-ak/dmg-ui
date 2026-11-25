import { ScreenPresenter } from 'dmg-ui/chat-ui';
import { TaskCardScreenDef } from '../../../../platform/ui';

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
