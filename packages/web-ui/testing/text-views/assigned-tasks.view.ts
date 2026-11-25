import { AssignedTasksScreenDef, TaskLines } from 'dmg-ui/example';
import { PagePresenter } from 'dmg-ui/web-ui';

/** «Назначенные мне» на странице: поручения со статусом. */
export const AssignedTasksView = PagePresenter.for(
  AssignedTasksScreenDef,
  ({ data }) =>
    new TaskLines(data?.tasks ?? [], undefined).text('Поручений нет.'),
);
