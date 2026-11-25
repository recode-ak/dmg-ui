import { TaskListScreenDef } from '../../../../platform/ui';
import { ExampleScreenView } from '../../../web-kit/example-screen-view';
import { EMPTY_TEXTS } from '../../../web-kit/view-texts.const';

/** «Мои задачи»: строки с признаками, действия и форма создания. */
export const TaskListView = ExampleScreenView.for(
  TaskListScreenDef,
  (view, controls) => {
    const tasks = view.data?.tasks ?? [];
    const selected = view.state?.selected ?? [];
    return {
      kind: 'list',
      rows: tasks.map((task) => ({
        uuid: task.uuid,
        title: task.title,
        done: task.status === 'done',
        selected: selected.includes(task.uuid),
        selectable: task.status === 'open',
        openable: true,
      })),
      ...(tasks.length === 0 ? { empty: EMPTY_TEXTS.list } : {}),
      ...controls,
    };
  },
);
