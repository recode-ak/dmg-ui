import { type DomainError, ok, type Result } from 'dmg-core';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type FieldChoices,
  type FieldValues,
  type LoadContext,
  ScreenCode,
  type StateOf,
} from 'dmg-ui';
import { TASK_PAGE_SIZE, TaskRows } from './example-tasks';
import { TaskCardScreenDef } from './task-card.screen';
import { TaskListScreenDef } from './task-list.screen';

type List = typeof TaskListScreenDef;
type ListData = DataOf<List>;
type ListState = StateOf<List>;

/**
 * Код списка задач. Выполнять имеет смысл только выбранные открытые задачи
 * страницы: после выполнения выбор остаётся, но действие гаснет, а команда
 * не шлёт выполненные (иначе `TASK_ALREADY_DONE`).
 */
export class TaskListScreenCode extends ScreenCode<List> {
  /** Отметить можно только задачу из данных; чужой id выбор не меняет. */
  override readonly locals = {
    toggle: (
      state: ListState,
      data: ListData,
      input: { taskId: string },
    ): ListState => {
      if (!data.tasks.some((task) => task.uuid === input.taskId)) return state;
      return {
        selected: state.selected.includes(input.taskId)
          ? state.selected.filter((id) => id !== input.taskId)
          : [...state.selected, input.taskId],
      };
    },
  };

  override readonly actions: Partial<ActionSteps<List>> = {
    create: {
      done: (_, output) =>
        TaskListScreenDef.exits.created.with({ taskId: output.taskId }),
    },
    open: { done: ({ input }) => TaskCardScreenDef.at(input) },
    completeSelected: {
      command: ({ data, state }) => ({
        taskIds: TaskListScreenCode.openSelected(data, state),
      }),
      done: ({ params }) => TaskListScreenDef.at(params),
    },
    next: {
      done: ({ params }) => TaskListScreenDef.at({ page: params.page + 1 }),
    },
    prev: {
      done: ({ params }) => TaskListScreenDef.at({ page: params.page - 1 }),
    },
    close: { done: () => TaskListScreenDef.exits.closed.with() },
  };

  /** Выбранные задачи страницы, которые ещё открыты, — в порядке выбора. */
  static openSelected(data: ListData, state: ListState): string[] {
    const open = new Set(
      data.tasks.filter((task) => task.status === 'open').map((t) => t.uuid),
    );
    return state.selected.filter((id) => open.has(id));
  }

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
      hasMore: rows.length > from + TASK_PAGE_SIZE,
      hasPrev: params.page > 0,
    });
  }

  override initialState(): ListState {
    return { selected: [] };
  }

  override available(name: string, data: ListData, state: ListState): boolean {
    if (name === 'next') return data.hasMore;
    if (name === 'prev') return data.hasPrev;
    if (name === 'completeSelected') {
      return TaskListScreenCode.openSelected(data, state).length > 0;
    }
    if (name === 'open' || name === 'toggle') return data.tasks.length > 0;
    return true;
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
