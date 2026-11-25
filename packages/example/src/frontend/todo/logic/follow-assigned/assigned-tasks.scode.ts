import { type DomainError, ok, type Result } from 'dmg-core';
import {
  type ExampleUser,
  ListAssignedTasksUcDef,
  TaskPolicy,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  Availability,
  type AvailabilityFns,
  type DataOf,
  type FieldChoices,
  type LoadContext,
  ScreenCode,
  type StateOf,
} from 'dmg-ui';
import {
  AssignedTasksScreenDef,
  UserCardScreenDef,
} from '../../../../platform/ui';
import {
  TaskRows,
  TaskSelection,
} from '../../../../platform/ui/todo/shared/example-tasks';

type Assigned = typeof AssignedTasksScreenDef;
type AssignedData = DataOf<Assigned>;
type AssignedState = StateOf<Assigned>;

/**
 * Код экрана «Назначенные мне»: задачи из `listAssignedTasks` вызывающего;
 * карточка исполнителя — по субъекту контекста. Выбранные поручения
 * выполняет тот, кому разрешает Policy набора задач (`canManageAll`):
 * владелец каждой или администратор; исполнителю-не-владельцу действие
 * скрыто.
 */
export class AssignedTasksScreenCode extends ScreenCode<Assigned, ExampleUser> {
  override readonly locals = {
    toggle: (
      state: AssignedState,
      data: AssignedData,
      input: { taskId: string },
    ): AssignedState => ({
      selected: new TaskSelection(data.tasks, state.selected).toggled(
        input.taskId,
      ),
    }),
  };

  override readonly actions: Partial<ActionSteps<Assigned, ExampleUser>> = {
    completeSelected: {
      command: ({ data, state }) => ({
        taskIds: new TaskSelection(data.tasks, state.selected).openIds(),
      }),
      done: () => AssignedTasksScreenDef.at({}),
    },
    openAssignee: {
      done: ({ context }) => {
        // Без субъекта действие скрыто доступностью, исполнитель шага не
        // зовёт; бросок — дефект кода, а не штатный путь.
        if (context.subject === undefined) {
          throw new Error('openAssignee без субъекта');
        }
        return UserCardScreenDef.at({ userId: context.subject.uuid });
      },
    },
    close: { done: () => AssignedTasksScreenDef.exits.closed.with() },
  };

  override readonly availability: Partial<
    AvailabilityFns<Assigned, ExampleUser>
  > = {
    completeSelected: ({ data, state, subject }) =>
      Availability.given(
        new TaskSelection(data.tasks, state.selected).openTasks(),
        'Отметьте открытые задачи',
        (tasks) =>
          Availability.policy(TaskPolicy.rules.canManageAll, subject, {
            tasks,
          }),
      ),
    // Исполнитель — тот, кто смотрит: без субъекта карточки нет — скрыто.
    openAssignee: ({ data, subject }) =>
      subject === undefined
        ? Availability.hidden()
        : Availability.when(data.tasks.length > 0, 'Поручений нет'),
    toggle: ({ data }) =>
      Availability.when(data.tasks.length > 0, 'Поручений нет'),
  };

  override async load({
    read,
  }: LoadContext<Assigned>): Promise<Result<AssignedData, DomainError>> {
    const listed = await read(ListAssignedTasksUcDef, {});
    if (!listed.ok) return listed;
    return ok({ tasks: [...new TaskRows(listed.value).all] });
  }

  override initialState(): AssignedState {
    return { selected: [] };
  }

  override choices(name: string, data: AssignedData): FieldChoices {
    if (name !== 'toggle') return {};
    return {
      taskId: data.tasks.map((task) => ({
        value: task.uuid,
        label: task.title,
      })),
    };
  }
}
