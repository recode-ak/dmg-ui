import type { ReadonlyAr } from 'dmg-core';
import { ListTasksUcDef, TaskAr } from 'dmg-core/testing/example';
import type { AddressJson } from 'dmg-ui';
import type * as v from 'valibot';

// Константы примеров и строка задачи — общие для манифестов, кода и тестов
// учебного примера.

/** Открытая задача примеров («Хлеб»). */
export const TASK_A = '5e3d1c2b-7a6f-4e8d-b9c0-a1f2e3d4c5b6';
/** Выполненная задача примеров («Молоко»). */
export const TASK_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
/** Владелец задач примеров — он же субъект примеров (`exampleSubject`). */
export const OWNER = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';
/** Владелец задач, поручённых субъекту примеров («Назначенные мне»). */
export const ASSIGNER = '7c6b5a49-3827-4f16-a5e4-d3c2b1a09f8e';

/** Строк списка задач на одной странице: открытых задач не больше трёх — вторая страница достижима. */
export const TASK_PAGE_SIZE = 2;

/**
 * Строка задачи на экране — state задачи из выхода query UC (D-UI-93):
 * клиент восстанавливает из неё `TaskAr.readonly`. Схема state не
 * импортируется — она берётся из выхода `listTasks` (D-69).
 */
export const taskRow = ListTasksUcDef.output.item;

/** Строка задачи — тип по схеме `taskRow`. */
export type TaskRow = v.InferOutput<typeof taskRow>;

/** Время создания и изменения задач примеров. */
const EXAMPLE_AT = Date.UTC(2026, 0, 1);

/**
 * Строка state задачи для примеров Def: владелец по умолчанию — владелец
 * задач примеров; `assigneeId` — кому задача поручена.
 */
export const exampleTask = (
  uuid: string,
  title: string,
  status: 'open' | 'done',
  owner: { readonly ownerId?: string; readonly assigneeId?: string } = {},
): TaskRow => ({
  uuid,
  createdAt: EXAMPLE_AT,
  updatedAt: EXAMPLE_AT,
  version: 1,
  ownerId: owner.ownerId ?? OWNER,
  title,
  status,
  ...(owner.assigneeId === undefined
    ? {}
    : { assignment: { assigneeId: owner.assigneeId, assignedAt: EXAMPLE_AT } }),
});

/**
 * Строки экрана из выхода query UC задач: архивные отбрасываются вопросом Ar
 * (`isArchived`), а не сравнением статуса — копий вопросов Ar нет (D-UI-93).
 */
export class TaskRows {
  readonly all: readonly TaskRow[];

  constructor(tasks: readonly TaskRow[]) {
    this.all = tasks.filter((task) => !TaskAr.readonly(task).isArchived());
  }

  /** Строка задачи по `uuid`; нет — `undefined`. */
  find(uuid: string): TaskRow | undefined {
    return this.all.find((row) => row.uuid === uuid);
  }
}

/**
 * Выбор задач экрана: строки на экране и выбранные id. Выполнять имеет
 * смысл только выбранные открытые задачи — их id для команды и их Ar для
 * Policy набора задач.
 */
export class TaskSelection {
  constructor(
    private readonly rows: readonly TaskRow[],
    private readonly selected: readonly string[],
  ) {}

  /** Выбор после отметки `taskId`: задача из строк — добавлена или убрана, чужой id выбор не меняет. */
  toggled(taskId: string): string[] {
    if (!this.rows.some((row) => row.uuid === taskId))
      return [...this.selected];
    return this.selected.includes(taskId)
      ? this.selected.filter((id) => id !== taskId)
      : [...this.selected, taskId];
  }

  /** Выбранные задачи, которые ещё открыты (вопрос Ar `isOpen`), — в порядке выбора. */
  openIds(): string[] {
    const open = new Set(
      this.rows
        .filter((row) => TaskAr.readonly(row).isOpen())
        .map((row) => row.uuid),
    );
    return this.selected.filter((id) => open.has(id));
  }

  /**
   * Выбранные открытые задачи как `ReadonlyAr` — контекст Policy набора
   * задач; ничего не выбрано — `undefined` (контекст не собран).
   */
  openTasks(): readonly ReadonlyAr<TaskAr>[] | undefined {
    const ids = this.openIds();
    if (ids.length === 0) return undefined;
    return this.rows
      .filter((row) => ids.includes(row.uuid))
      .map((row) => TaskAr.readonly(row));
  }
}

/** `id` экрана списка задач в графе и записях наблюдателя. */
export const LIST_ID = 'exampleUi/todo/taskList';
/** `id` экрана карточки задачи. */
export const CARD_ID = 'exampleUi/todo/taskCard';
/** `id` экрана «Назначенные мне». */
export const ASSIGNED_ID = 'exampleUi/todo/assignedTasks';

/** Адрес списка задач с первой страницы — как его видит канал (JSON). */
export const LIST_START: AddressJson = { screen: LIST_ID, params: { page: 0 } };
