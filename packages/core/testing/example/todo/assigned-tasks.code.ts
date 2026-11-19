import { type DomainError, ok, type Result } from 'dmg-core';
import { ListAssignedTasksUcDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type DataOf,
  type LoadContext,
  ScreenCode,
} from 'dmg-ui';
import { UserCardScreenDef } from '../users/user-card.screen';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';
import { TaskRows } from './example-tasks';

type Assigned = typeof AssignedTasksScreenDef;
type AssignedData = DataOf<Assigned>;

/**
 * Код экрана «Назначенные мне»: задачи из `listAssignedTasks` вызывающего и
 * исполнитель из назначения первой строки; без поручений исполнителя нет и
 * карточка исполнителя недоступна.
 */
export class AssignedTasksScreenCode extends ScreenCode<Assigned> {
  override readonly actions: Partial<ActionSteps<Assigned>> = {
    openAssignee: {
      done: ({ data }) => {
        // Исполнитель задан: без него действие недоступно (`available`).
        if (data.assigneeId === undefined) {
          throw new Error('openAssignee без исполнителя');
        }
        return UserCardScreenDef.at({ userId: data.assigneeId });
      },
    },
    close: { done: () => AssignedTasksScreenDef.exits.closed.with() },
  };

  override async load({
    read,
  }: LoadContext<Assigned>): Promise<Result<AssignedData, DomainError>> {
    const listed = await read(ListAssignedTasksUcDef, {});
    if (!listed.ok) return listed;
    const tasks = [...new TaskRows(listed.value).all];
    const assigneeId = listed.value[0]?.assignment?.assigneeId;
    return ok(assigneeId === undefined ? { tasks } : { tasks, assigneeId });
  }

  override available(name: string, data: AssignedData): boolean {
    return name !== 'openAssignee' || data.assigneeId !== undefined;
  }
}
