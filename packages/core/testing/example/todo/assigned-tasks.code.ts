import { type DomainError, ok, type Result } from 'dmg-core';
import { ListAssignedTasksUcDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type LoadContext,
  ScreenCode,
} from 'dmg-ui';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';
import { TaskRows } from './example-tasks';

type Assigned = typeof AssignedTasksScreenDef;

/** Код экрана «Назначенные мне»: задачи из `listAssignedTasks` вызывающего. */
export class AssignedTasksScreenCode extends ScreenCode<Assigned> {
  override readonly actions: Partial<ActionSteps<Assigned>> = {
    close: { done: () => AssignedTasksScreenDef.exits.closed.with() },
  };

  override async load({
    read,
  }: LoadContext<Assigned>): Promise<Result<DataOf<Assigned>, DomainError>> {
    const listed = await read(ListAssignedTasksUcDef, {});
    if (!listed.ok) return listed;
    return ok({ tasks: [...new TaskRows(listed.value).all] });
  }
}
