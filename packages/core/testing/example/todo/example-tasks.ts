import { F } from 'dmg-core';
import type { AddressJson } from 'dmg-ui';
import * as v from 'valibot';

// Константы примеров и строка задачи — общие для манифестов, кода и тестов
// учебного примера.

/** Открытая задача примеров («Хлеб»). */
export const TASK_A = '5e3d1c2b-7a6f-4e8d-b9c0-a1f2e3d4c5b6';
/** Выполненная задача примеров («Молоко»). */
export const TASK_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
/** Владелец задач примеров. */
export const OWNER = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';

/** Строк списка задач на одной странице: открытых задач не больше трёх — вторая страница достижима. */
export const TASK_PAGE_SIZE = 2;

/** Строка задачи на экране: архивные на экран не попадают. */
export const taskRow = v.object({
  uuid: F.uuid('задачи'),
  title: v.pipe(v.string(), v.description('Название задачи')),
  status: v.pipe(v.picklist(['open', 'done']), v.description('Статус задачи')),
});

/** Строка задачи — тип по схеме `taskRow`. */
export type TaskRow = v.InferOutput<typeof taskRow>;

/** Задача из выхода `listTasks` или `listAssignedTasks`: статус — любой из домена. */
type ListedTask = {
  readonly uuid: string;
  readonly title: string;
  readonly status: string;
};

/** Строки экрана из выхода query UC задач: архивные отбрасываются. */
export class TaskRows {
  readonly all: readonly TaskRow[];

  constructor(tasks: readonly ListedTask[]) {
    this.all = tasks.flatMap((task) =>
      task.status === 'open' || task.status === 'done'
        ? [{ uuid: task.uuid, title: task.title, status: task.status }]
        : [],
    );
  }

  /** Строка задачи по `uuid`; нет — `undefined`. */
  find(uuid: string): TaskRow | undefined {
    return this.all.find((row) => row.uuid === uuid);
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
