import { CodeLoader, CodeLoaders } from 'dmg-ui';
import type { ExampleCodeOverrides } from './example-codes.types';
import { ExampleUiSetDef } from './example-ui.set';
import { AssignedTasksScreenDef } from './todo/assigned-tasks.screen';
import { MainMenuScreenDef } from './todo/main-menu.screen';
import { TaskAssignedNotificationDef } from './todo/task-assigned.notification';
import { TaskCardScreenDef } from './todo/task-card.screen';
import { TaskCompletedNotificationDef } from './todo/task-completed.notification';
import { TaskListScreenDef } from './todo/task-list.screen';
import { UserCardScreenDef } from './users/user-card.screen';

export type { ExampleCodeOverrides } from './example-codes.types';

/**
 * Загрузчики кода набора примера: код грузится лениво (`import()`), кэш —
 * свежий на каждый вызов; `over` подменяет код отдельных узлов.
 */
export const exampleCodes = (over: ExampleCodeOverrides = {}): CodeLoaders =>
  CodeLoaders.of(ExampleUiSetDef, [
    CodeLoader.screen(
      TaskListScreenDef,
      async () =>
        over.list ??
        new (await import('./todo/task-list.code')).TaskListScreenCode(),
    ),
    CodeLoader.screen(
      TaskCardScreenDef,
      async () =>
        over.card ??
        new (await import('./todo/task-card.code')).TaskCardScreenCode(),
    ),
    CodeLoader.screen(
      AssignedTasksScreenDef,
      async () =>
        over.assigned ??
        new (
          await import('./todo/assigned-tasks.code')
        ).AssignedTasksScreenCode(),
    ),
    CodeLoader.screen(
      MainMenuScreenDef,
      async () =>
        over.menu ??
        new (await import('./todo/main-menu.code')).MainMenuScreenCode(),
    ),
    CodeLoader.screen(
      UserCardScreenDef,
      async () =>
        over.user ??
        new (await import('./users/user-card.code')).UserCardScreenCode(),
    ),
    CodeLoader.notification(
      TaskAssignedNotificationDef,
      async () =>
        over.assignedNote ??
        new (
          await import('./todo/task-assigned.code')
        ).TaskAssignedNotificationCode(),
    ),
    CodeLoader.notification(
      TaskCompletedNotificationDef,
      async () =>
        over.completedNote ??
        new (
          await import('./todo/task-completed.code')
        ).TaskCompletedNotificationCode(),
    ),
  ]);
