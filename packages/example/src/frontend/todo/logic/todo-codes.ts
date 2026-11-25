import { CodeLoader, CodeLoaders } from 'dmg-ui';
import {
  AssignedTasksScreenDef,
  MainMenuScreenDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  TodoUiModuleDef,
} from '../../../platform/ui';
import type { TodoCodeOverrides } from './todo-codes.types';

/**
 * Реестр кода модуля `todo` примера: код грузится лениво (`import()`), кэш —
 * свежий на каждый вызов; `over` подменяет код отдельных узлов.
 */
export const todoCodes = (over: TodoCodeOverrides = {}): CodeLoaders =>
  CodeLoaders.of(TodoUiModuleDef, [
    CodeLoader.screen(
      TaskListScreenDef,
      async () =>
        over.list ??
        new (await import('./shared/task-list.scode')).TaskListScreenCode(),
    ),
    CodeLoader.screen(
      TaskCardScreenDef,
      async () =>
        over.card ??
        new (
          await import('./finish-tasks/task-card.scode')
        ).TaskCardScreenCode(),
    ),
    CodeLoader.screen(
      AssignedTasksScreenDef,
      async () =>
        over.assigned ??
        new (
          await import('./follow-assigned/assigned-tasks.scode')
        ).AssignedTasksScreenCode(),
    ),
    CodeLoader.screen(
      MainMenuScreenDef,
      async () =>
        over.menu ??
        new (await import('./start-work/main-menu.scode')).MainMenuScreenCode(),
    ),
    CodeLoader.notification(
      TaskAssignedNotificationDef,
      async () =>
        over.assignedNote ??
        new (
          await import('./shared/task-assigned.ncode')
        ).TaskAssignedNotificationCode(),
    ),
    CodeLoader.notification(
      TaskCompletedNotificationDef,
      async () =>
        over.completedNote ??
        new (
          await import('./shared/task-completed.ncode')
        ).TaskCompletedNotificationCode(),
    ),
  ]);
