import { TaskErrors } from 'dmg-core/testing/example';
import { ScreenPresenter } from '../../dialog';
import { TaskListScreenDef } from '../todo/task-list.screen';
import { TaskLines } from './task-lines';

/** Список задач в диалоге: задачи с отметкой выбора; свой ответ на предел открытых. */
export const TaskListView = ScreenPresenter.for(
  TaskListScreenDef,
  ({ data, state }) =>
    [
      TaskListScreenDef.label,
      new TaskLines(data?.tasks ?? [], state?.selected ?? []).text(
        'Задач пока нет. Напишите название — создам задачу.',
      ),
    ].join('\n'),
  {
    [TaskErrors.TOO_MANY_OPEN.code]:
      'Открытых задач слишком много — сначала выполните часть.',
  },
);
