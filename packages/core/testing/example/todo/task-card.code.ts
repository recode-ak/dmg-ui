import { type DomainError, ok, type Result } from 'dmg-core';
import {
  type ExampleUser,
  ListTasksUcDef,
  TaskAr,
  TaskErrors,
  TaskPolicy,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  Availability,
  type AvailabilityFns,
  type DataOf,
  type LoadContext,
  ScreenCode,
} from 'dmg-ui';
import { TaskRows } from './example-tasks';
import { TaskCardScreenDef } from './task-card.screen';
import { TaskListScreenDef } from './task-list.screen';

type Card = typeof TaskCardScreenDef;
type CardData = DataOf<Card>;

/**
 * Код карточки задачи; экран без состояния — `initialState` не нужен.
 * «Выполнить» и «Назначить» решает Policy задачи (`canManage`) над
 * `TaskAr.readonly` из state, «Выполнить» — ещё и статус задачи.
 */
export class TaskCardScreenCode extends ScreenCode<Card, ExampleUser> {
  override readonly actions: Partial<ActionSteps<Card, ExampleUser>> = {
    back: { done: () => TaskListScreenDef.at({ page: 0 }) },
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

  override readonly availability: Partial<AvailabilityFns<Card, ExampleUser>> =
    {
      complete: ({ data, subject }) => {
        const task = TaskAr.readonly(data);
        return Availability.all(
          Availability.policy(TaskPolicy.rules.canManage, subject, { task }),
          Availability.when(task.isOpen(), 'Задача уже выполнена'),
        );
      },
      assign: ({ data, subject }) =>
        Availability.policy(TaskPolicy.rules.canManage, subject, {
          task: TaskAr.readonly(data),
        }),
    };

  /** Карточка ищет задачу в списке вызывающего; нет — `TASK_NOT_FOUND`. */
  override async load({
    params,
    read,
  }: LoadContext<Card>): Promise<Result<CardData, DomainError>> {
    const listed = await read(ListTasksUcDef, {});
    if (!listed.ok) return listed;
    const task = new TaskRows(listed.value).find(params.taskId);
    return task === undefined
      ? TaskErrors.NOT_FOUND.err({ taskId: params.taskId })
      : ok(task);
  }
}
