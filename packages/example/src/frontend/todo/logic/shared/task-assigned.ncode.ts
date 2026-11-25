import { ListAssignedTasksUcDef } from 'dmg-core/testing/example';
import {
  type Address,
  NotificationCode,
  type NotificationLoadContext,
} from 'dmg-ui';
import {
  AssignedTasksScreenDef,
  type TaskAssignedNotificationDef,
} from '../../../../platform/ui';
import { TaskNote } from './task-note';

type Note = typeof TaskAssignedNotificationDef;

/**
 * Код уведомления: название задачи — из поручений получателя
 * (`listAssignedTasks` от его имени); ссылка — экран «Назначенные мне».
 */
export class TaskAssignedNotificationCode extends NotificationCode<Note> {
  override async load({ payload, read }: NotificationLoadContext<Note>) {
    const listed = await read(ListAssignedTasksUcDef, {});
    if (!listed.ok) return listed;
    return new TaskNote(payload).titleIn(listed.value);
  }

  override links(): readonly Address[] {
    return [AssignedTasksScreenDef.at({})];
  }
}
