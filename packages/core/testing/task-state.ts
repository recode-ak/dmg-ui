import type { OutputOf } from 'dmg-core';
import type { ListTasksUcDef } from 'dmg-core/testing/example';
import { OWNER } from './example';

// Строка задачи как её отдаёт query UC — state целиком (D-UI-93): клиент
// восстанавливает из неё `TaskAr.readonly`. Центральный сборщик строк для
// тестов ядра: правило «три поля вместо state» ломает `TaskAr.readonly`.

/** Строка выхода `listTasks` и `listAssignedTasks` — state задачи. */
export type TaskStateRow = OutputOf<typeof ListTasksUcDef>[number];

const AT = Date.UTC(2026, 0, 1);

type TaskStateSpec = Pick<TaskStateRow, 'uuid' | 'title' | 'status'> &
  Partial<TaskStateRow>;

/** Строка state задачи; владелец по умолчанию — владелец задач примеров. */
export const taskState = (spec: TaskStateSpec): TaskStateRow => ({
  createdAt: AT,
  updatedAt: AT,
  version: 1,
  ownerId: OWNER,
  ...spec,
});
