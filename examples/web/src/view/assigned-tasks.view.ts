import { AssignedTasksScreenDef } from 'dmg-ui/testing';
import { ExampleScreenView } from './example-screen-view';
import { EMPTY_TEXTS } from './view-texts.const';

/** «Назначенные мне»: поручения со статусом, без управления. */
export const AssignedTasksView = ExampleScreenView.for(
  AssignedTasksScreenDef,
  (view) => {
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
    };
  },
);
