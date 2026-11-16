import { PagePresenter } from '../../page/client/page-views';
import { TaskCardScreenDef } from '../todo/task-card.screen';

/** Карточка задачи на странице: название и статус. */
export const TaskCardView = PagePresenter.for(TaskCardScreenDef, ({ data }) =>
  data === undefined
    ? ''
    : [
        data.title,
        data.status === 'done' ? 'Статус: выполнена' : 'Статус: открыта',
      ].join('\n'),
);
