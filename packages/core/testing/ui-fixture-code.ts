import type { DataOf, StateOf } from '../src/manifest/screen-def';
import { ScreenCode } from '../src/screen/screen-code';
import type { TaskCardScreenDef, TaskListScreenDef } from './ui-fixture';

// Код экранов фикстуры (чистая часть): отдельно от манифестов, чтобы
// `ui-fixture.ts` читался без `screen/`.

type ListData = DataOf<typeof TaskListScreenDef>;
type ListState = StateOf<typeof TaskListScreenDef>;
type CardData = DataOf<typeof TaskCardScreenDef>;

export class TaskListScreenCode extends ScreenCode<typeof TaskListScreenDef> {
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
    if (name !== 'open') return {};
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
export class TaskCardScreenCode extends ScreenCode<typeof TaskCardScreenDef> {
  override available(name: string, data: CardData): boolean {
    return name !== 'complete' || data.status === 'open';
  }
}
