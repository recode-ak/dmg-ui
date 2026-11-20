import { type DomainError, ok, type Result } from 'dmg-core';
import { ListAssignedTasksUcDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type LoadContext,
  ScreenCode,
  type StateOf,
} from 'dmg-ui';
import { AssignedTasksScreenDef } from 'dmg-ui/testing';

type Assigned = typeof AssignedTasksScreenDef;

/**
 * Код «Назначенные мне» с ложной доступностью: показывает «Выполнить
 * выбранные» всем. Единственная подмена кода экрана в приёмке: нужна, чтобы
 * проверить, что сервер перепроверяет Policy самого UC, а не верит виду.
 */
export class LiarAssignedScreenCode extends ScreenCode<Assigned> {
  override readonly locals = {
    toggle: (
      state: StateOf<Assigned>,
      _data: DataOf<Assigned>,
      input: { taskId: string },
    ): StateOf<Assigned> => ({
      selected: state.selected.includes(input.taskId)
        ? state.selected.filter((id) => id !== input.taskId)
        : [...state.selected, input.taskId],
    }),
  };

  override readonly actions: Partial<ActionSteps<Assigned>> = {
    completeSelected: {
      command: ({ state }) => ({ taskIds: state.selected }),
      done: () => AssignedTasksScreenDef.at({}),
    },
    openAssignee: { done: () => AssignedTasksScreenDef.at({}) },
    close: { done: () => AssignedTasksScreenDef.exits.closed.with() },
  };

  override async load({
    read,
  }: LoadContext<Assigned>): Promise<Result<DataOf<Assigned>, DomainError>> {
    const listed = await read(ListAssignedTasksUcDef, {});
    if (!listed.ok) return listed;
    return ok({ tasks: [...listed.value] });
  }

  override initialState(): StateOf<Assigned> {
    return { selected: [] };
  }

  override choices(_name: string, data: DataOf<Assigned>) {
    return {
      taskId: data.tasks.map((task) => ({
        value: task.uuid,
        label: task.title,
      })),
    };
  }
}
