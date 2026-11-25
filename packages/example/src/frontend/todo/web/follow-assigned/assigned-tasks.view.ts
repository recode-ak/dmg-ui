import { AssignedTasksScreenDef } from '../../../../platform/ui';
import { ExampleScreenView } from '../../../web-kit/example-screen-view';
import { EMPTY_TEXTS } from '../../../web-kit/view-texts.const';

const ASSIGNED_ACTIONS: readonly string[] = [
  'openAssignee',
  'close',
  'completeSelected',
];

/**
 * «Назначенные мне»: поручения со статусом; у открытых — галочка;
 * кнопки — «Карточка исполнителя», «Закрыть» и «Выполнить выбранные».
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
        selected: view.state?.selected?.includes(task.uuid) ?? false,
        selectable: task.status === 'open',
        openable: false,
      })),
      ...(tasks.length === 0 ? { empty: EMPTY_TEXTS.assigned } : {}),
      actions: controls.actions.filter((action) =>
        ASSIGNED_ACTIONS.includes(action.name),
      ),
    };
  },
);
