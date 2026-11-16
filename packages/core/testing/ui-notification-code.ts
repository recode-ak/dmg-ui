import { ok } from 'dmg-core';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import { type Address, NotificationCode } from 'dmg-ui';
import * as v from 'valibot';
import {
  type TaskAssignedNotificationDef,
  TaskCardScreenDef,
} from './ui-fixture';

// Код уведомления фикстуры — отдельно от кода экранов: тесты чистой логики
// экрана (`screen-logic.test.ts`) не тянут исполнитель уведомлений.

type Assigned = typeof TaskAssignedNotificationDef;

const AssignedPayload = v.object({ taskId: v.string() });

/**
 * Уведомление о назначении. `listTasks` отдаёт только задачи вызывающего:
 * получатель чужую задачу не видит, название — запасное (учебному примеру
 * нужен UC «задачи, назначенные мне»).
 */
export class TaskAssignedNotificationCode extends NotificationCode<Assigned> {
  override async load({
    payload,
    read,
  }: Parameters<NotificationCode<Assigned>['load']>[0]) {
    const { taskId } = v.parse(AssignedPayload, payload);
    const listed = await read(ListTasksUcDef, {});
    if (!listed.ok) return listed;
    const task = listed.value.find((row) => row.uuid === taskId);
    return ok({ title: task?.title ?? 'Задача' });
  }

  override links(_: unknown, payload: unknown): readonly Address[] {
    const { taskId } = v.parse(AssignedPayload, payload);
    return [TaskCardScreenDef.at({ taskId })];
  }
}
