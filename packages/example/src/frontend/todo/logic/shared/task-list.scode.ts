import { type DomainError, ok, type Result } from 'dmg-core';
import {
  type ExampleUser,
  ListTasksUcDef,
  TaskAr,
  TaskPolicy,
  TaskRules,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  Availability,
  type AvailabilityFns,
  type DataOf,
  type FieldChoices,
  type FieldValues,
  type LoadContext,
  ScreenCode,
  type StateOf,
} from 'dmg-ui';
import { TaskCardScreenDef, TaskListScreenDef } from '../../../../platform/ui';
import {
  TASK_PAGE_SIZE,
  TaskRows,
  TaskSelection,
} from '../../../../platform/ui/todo/shared/example-tasks';

type List = typeof TaskListScreenDef;
type ListData = DataOf<List>;
type ListState = StateOf<List>;

/**
 * Код списка задач. Выполнять имеет смысл только выбранные открытые задачи
 * страницы: после выполнения выбор остаётся, но действие гаснет, а команда
 * не шлёт выполненные (иначе `TASK_ALREADY_DONE`). Доступность решает домен
 * на клиенте: предел открытых (`TaskRules`) над всеми задачами вызывающего и
 * Policy набора (`TaskPolicy`) над выбранными — те же правила, что у UC.
 */
export class TaskListScreenCode extends ScreenCode<List, ExampleUser> {
  /** Отметить можно только задачу из данных; чужой id выбор не меняет. */
  override readonly locals = {
    toggle: (
      state: ListState,
      data: ListData,
      input: { taskId: string },
    ): ListState => ({
      selected: new TaskSelection(data.tasks, state.selected).toggled(
        input.taskId,
      ),
    }),
  };

  override readonly actions: Partial<ActionSteps<List, ExampleUser>> = {
    create: {
      done: (_, output) =>
        TaskListScreenDef.exits.created.with({ taskId: output.taskId }),
    },
    open: { done: ({ input }) => TaskCardScreenDef.at(input) },
    completeSelected: {
      command: ({ data, state }) => ({
        taskIds: new TaskSelection(data.tasks, state.selected).openIds(),
      }),
      done: ({ params }) => TaskListScreenDef.at(params),
    },
    jumpTo: {
      done: ({ input }) => TaskListScreenDef.at({ page: input.part - 1 }),
    },
    next: {
      done: ({ params }) => TaskListScreenDef.at({ page: params.page + 1 }),
    },
    prev: {
      done: ({ params }) => TaskListScreenDef.at({ page: params.page - 1 }),
    },
    close: { done: () => TaskListScreenDef.exits.closed.with() },
  };

  override readonly availability: Partial<AvailabilityFns<List, ExampleUser>> =
    {
      create: ({ data }) =>
        Availability.rule(TaskRules.rules.withinOpenLimit, {
          ownerTasks: data.owned.map((row) => TaskAr.readonly(row)),
        }),
      completeSelected: ({ data, state, subject }) =>
        Availability.given(
          new TaskSelection(data.tasks, state.selected).openTasks(),
          'Отметьте открытые задачи',
          (tasks) =>
            Availability.policy(TaskPolicy.rules.canManageAll, subject, {
              tasks,
            }),
        ),
      open: ({ data }) => Availability.when(data.tasks.length > 0, 'Задач нет'),
      toggle: ({ data }) =>
        Availability.when(data.tasks.length > 0, 'Задач нет'),
      next: ({ data }) => Availability.when(data.hasMore, 'Дальше задач нет'),
      prev: ({ data }) =>
        Availability.when(data.hasPrev, 'Это первая страница'),
    };

  override async load({
    params,
    read,
  }: LoadContext<List>): Promise<Result<ListData, DomainError>> {
    const listed = await read(ListTasksUcDef, {});
    if (!listed.ok) return listed;
    const rows = new TaskRows(listed.value).all;
    const from = params.page * TASK_PAGE_SIZE;
    return ok({
      tasks: rows.slice(from, from + TASK_PAGE_SIZE),
      owned: [...rows],
      hasMore: rows.length > from + TASK_PAGE_SIZE,
      hasPrev: params.page > 0,
    });
  }

  override initialState(): ListState {
    return { selected: [] };
  }

  override choices(name: string, data: ListData): FieldChoices {
    if (name !== 'open' && name !== 'toggle') return {};
    return {
      taskId: data.tasks.map((task) => ({
        value: task.uuid,
        label: task.title,
      })),
    };
  }

  override defaults(name: string): FieldValues {
    return name === 'create' ? { title: 'Новая задача' } : {};
  }
}
