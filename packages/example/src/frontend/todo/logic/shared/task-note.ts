import { type DomainError, ok, type Result } from 'dmg-core';
import { TaskErrors } from 'dmg-core/testing/example';
import * as v from 'valibot';

// Общая часть кода двух уведомлений о задаче: `taskId` из payload и
// название задачи среди поручений получателя.

const TaskPayload = v.object({ taskId: v.string() });

/** Задача из `listAssignedTasks`: нужны только `uuid` и название. */
type AssignedTask = { readonly uuid: string; readonly title: string };

/** Уведомление о задаче из payload события (payload проверен сервером по схеме события). */
export class TaskNote {
  readonly taskId: string;

  constructor(payload: unknown) {
    this.taskId = v.parse(TaskPayload, payload).taskId;
  }

  /** Данные уведомления; задачи нет среди поручений — `TASK_NOT_FOUND`, доставки нет. */
  titleIn(
    tasks: readonly AssignedTask[],
  ): Result<{ title: string }, DomainError> {
    const task = tasks.find((row) => row.uuid === this.taskId);
    return task === undefined
      ? TaskErrors.NOT_FOUND.err({ taskId: this.taskId })
      : ok({ title: task.title });
  }
}
