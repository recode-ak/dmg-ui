import { type DomainError, ok, type Result } from 'dmg-core';
import { ListTasksUcDef, TaskErrors } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type LoadContext,
  ScreenCode,
  type StateOf,
} from 'dmg-ui';
import { TaskCardScreenDef, TaskListScreenDef } from './ui-fixture';

// Код экранов фикстуры: отдельно от манифестов, чтобы `ui-fixture.ts`
// читался без `screen/`; код уведомления — `ui-notification-code.ts`. Ядро —
// по имени `dmg-ui`, как у кода экрана приложения (зона «код экрана»
// сканера импортов).

/** Строк списка на одном шаге `next`. */
export const PAGE = 10;

type List = typeof TaskListScreenDef;
type Card = typeof TaskCardScreenDef;
type ListData = DataOf<List>;
type ListState = StateOf<List>;
type CardData = DataOf<Card>;
type TaskRow = ListData['tasks'][number];
type ListedTask = {
  readonly uuid: string;
  readonly title: string;
  readonly status: string;
};

/** Строки экрана из выхода `listTasks`: архивные на экран не попадают. */
const rowsOf = (tasks: readonly ListedTask[]): TaskRow[] =>
  tasks.flatMap((task) =>
    task.status === 'open' || task.status === 'done'
      ? [{ uuid: task.uuid, title: task.title, status: task.status }]
      : [],
  );

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

  /** `completeSelected` выполняет первую выбранную задачу: пакетного UC в примере нет. */
  override readonly actions: Partial<ActionSteps<List>> = {
    open: { done: ({ input }) => TaskCardScreenDef.at(input) },
    create: {
      done: (_, output) =>
        TaskListScreenDef.exits.created.with({ taskId: output.taskId }),
    },
    completeSelected: {
      // Без выбора действие недоступно (`available`); `?? ''` — для типа.
      command: ({ state }) => ({ taskId: state.selected[0] ?? '' }),
      done: ({ params }) => TaskListScreenDef.at(params),
    },
    next: {
      done: ({ params }) =>
        TaskListScreenDef.at({ index: params.index + PAGE }),
    },
  };

  override async load({
    params,
    read,
  }: LoadContext<List>): Promise<Result<ListData, DomainError>> {
    const listed = await read(ListTasksUcDef, {});
    if (!listed.ok) return listed;
    const rows = rowsOf(listed.value);
    return ok({
      tasks: rows.slice(params.index, params.index + PAGE),
      hasMore: rows.length > params.index + PAGE,
      marked: [],
    });
  }

  /** Выбор, сохранённый в данных, — начальный. */
  override initialState(data: ListData): ListState {
    return { selected: [...data.marked] };
  }

  override available(name: string, data: ListData, state: ListState): boolean {
    if (name === 'next') return data.hasMore;
    if (name === 'completeSelected') return state.selected.length > 0;
    return true;
  }

  override choices(name: string, data: ListData) {
    if (name !== 'open' && name !== 'toggle') return {};
    return {
      taskId: data.tasks.map((task) => ({
        value: task.uuid,
        label: task.title,
      })),
    };
  }

  override defaults(name: string) {
    return name === 'create' ? { title: 'Новая задача' } : {};
  }
}

/** Экран без состояния: `initialState` не нужен. */
export class TaskCardScreenCode extends ScreenCode<Card> {
  override readonly actions: Partial<ActionSteps<Card>> = {
    back: { done: () => TaskListScreenDef.at({ index: 0 }) },
    complete: {
      command: ({ params }) => ({ taskId: params.taskId }),
      done: ({ params }) => TaskCardScreenDef.at(params),
    },
    assign: {
      command: ({ params, input }) => ({
        taskId: params.taskId,
        assigneeId: input.assigneeId,
      }),
      done: ({ params }) => TaskCardScreenDef.at(params),
    },
  };

  /** Карточка ищет задачу в списке вызывающего; нет — `TASK_NOT_FOUND`. */
  override async load({
    params,
    read,
  }: LoadContext<Card>): Promise<Result<CardData, DomainError>> {
    const listed = await read(ListTasksUcDef, {});
    if (!listed.ok) return listed;
    const task = rowsOf(listed.value).find((row) => row.uuid === params.taskId);
    return task === undefined
      ? TaskErrors.NOT_FOUND.err({ taskId: params.taskId })
      : ok(task);
  }

  override available(name: string, data: CardData): boolean {
    return name !== 'complete' || data.status === 'open';
  }
}
