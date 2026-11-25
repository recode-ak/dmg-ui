import { TaskCardScreenDef } from 'dmg-ui/example';
import { PagePresenter } from 'dmg-ui/web-ui';

/** Карточка задачи на странице: название и статус. */
export const TaskCardView = PagePresenter.for(TaskCardScreenDef, ({ data }) =>
  data === undefined
    ? ''
    : [
        data.title,
        data.status === 'done' ? 'Статус: выполнена' : 'Статус: открыта',
      ].join('\n'),
);
