import { type DomainError, ok, type Result } from 'dmg-core';
import { ListTasksUcDef, TaskErrors } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type LoadContext,
  ScreenCode,
} from 'dmg-ui';
import { TaskRows } from './example-tasks';
import { TaskCardScreenDef } from './task-card.screen';
import { TaskListScreenDef } from './task-list.screen';

type Card = typeof TaskCardScreenDef;
type CardData = DataOf<Card>;

/** Код карточки задачи; экран без состояния — `initialState` не нужен. */
export class TaskCardScreenCode extends ScreenCode<Card> {
  override readonly actions: Partial<ActionSteps<Card>> = {
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

  /** Выполнить можно только открытую задачу — действие, недоступное по данным. */
  override available(name: string, data: CardData): boolean {
    return name !== 'complete' || data.status === 'open';
  }
}
