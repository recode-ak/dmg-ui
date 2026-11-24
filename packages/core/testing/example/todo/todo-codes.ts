import { CodeLoader, CodeLoaders } from 'dmg-ui';
import type { ExampleCodeOverrides } from '../example-codes.types';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';
import { MainMenuScreenDef } from './main-menu.screen';
import { TaskAssignedNotificationDef } from './task-assigned.notification';
import { TaskCardScreenDef } from './task-card.screen';
import { TaskCompletedNotificationDef } from './task-completed.notification';
import { TaskListScreenDef } from './task-list.screen';
import { TodoUiModuleDef } from './todo.ui-module';

/**
 * Реестр кода модуля `todo` примера: код грузится лениво (`import()`), кэш —
 * свежий на каждый вызов; `over` подменяет код отдельных узлов.
 */
export const todoCodes = (over: ExampleCodeOverrides = {}): CodeLoaders =>
  CodeLoaders.of(TodoUiModuleDef, [
    CodeLoader.screen(
      TaskListScreenDef,
      async () =>
        over.list ??
        new (await import('./task-list.scode')).TaskListScreenCode(),
    ),
    CodeLoader.screen(
      TaskCardScreenDef,
      async () =>
        over.card ??
        new (await import('./task-card.scode')).TaskCardScreenCode(),
    ),
    CodeLoader.screen(
      AssignedTasksScreenDef,
      async () =>
        over.assigned ??
        new (await import('./assigned-tasks.scode')).AssignedTasksScreenCode(),
    ),
    CodeLoader.screen(
      MainMenuScreenDef,
      async () =>
        over.menu ??
        new (await import('./main-menu.scode')).MainMenuScreenCode(),
    ),
    CodeLoader.notification(
      TaskAssignedNotificationDef,
      async () =>
        over.assignedNote ??
        new (
          await import('./task-assigned.ncode')
        ).TaskAssignedNotificationCode(),
    ),
    CodeLoader.notification(
      TaskCompletedNotificationDef,
      async () =>
        over.completedNote ??
        new (
          await import('./task-completed.ncode')
        ).TaskCompletedNotificationCode(),
    ),
  ]);
