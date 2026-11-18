import { TaskCardScreenDef } from 'dmg-ui/testing';
import { ExampleScreenView } from './example-screen-view';

/** «Задача»: название, статус, зона «Выполнено» и перетаскивание карточки. */
export const TaskCardView = ExampleScreenView.for(
  TaskCardScreenDef,
  (view, controls) => {
    const done = view.data?.status === 'done';
    const complete = controls.actions.find((a) => a.name === 'complete');
    const active = !done && complete?.enabled === true;
    return {
      kind: 'card',
      uuid: view.data?.uuid ?? '',
      title: view.data?.title ?? '',
      done,
      draggable: active,
      zone: done ? 'accepted' : 'waiting',
      dropEnabled: active,
      ...controls,
    };
  },
);
