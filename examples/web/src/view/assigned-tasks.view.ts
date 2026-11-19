import { AssignedTasksScreenDef } from 'dmg-ui/testing';
import { ExampleScreenView } from './example-screen-view';
import { EMPTY_TEXTS } from './view-texts.const';

const ASSIGNED_ACTIONS: readonly string[] = ['openAssignee', 'close'];

/**
 * «Назначенные мне»: поручения со статусом; кнопки — только «Карточка
 * исполнителя» и «Закрыть». Выполнение и выбор строк — за показом списка.
 */
export const AssignedTasksView = ExampleScreenView.for(
  AssignedTasksScreenDef,
  (view, controls) => {
    const tasks = view.data?.tasks ?? [];
    return {
      kind: 'assigned',
      rows: tasks.map((task) => ({
        uuid: task.uuid,
        title: task.title,
        done: task.status === 'done',
        selected: false,
        selectable: false,
        openable: false,
      })),
      ...(tasks.length === 0 ? { empty: EMPTY_TEXTS.assigned } : {}),
      actions: controls.actions.filter((action) =>
        ASSIGNED_ACTIONS.includes(action.name),
      ),
    };
  },
);
