import { type DomainError, ok, type Result } from 'dmg-core';
import { type ActionSteps, type DataOf, ScreenCode } from 'dmg-ui';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';
import { MainMenuScreenDef } from './main-menu.screen';
import { TaskListScreenDef } from './task-list.screen';

type Menu = typeof MainMenuScreenDef;

/** Код меню «Начать работу»: переходы в сторис задач и выход. */
export class MainMenuScreenCode extends ScreenCode<Menu> {
  override readonly actions: Partial<ActionSteps<Menu>> = {
    tasks: { done: () => TaskListScreenDef.at({ page: 0 }) },
    assigned: { done: () => AssignedTasksScreenDef.at({}) },
    close: { done: () => MainMenuScreenDef.exits.closed.with() },
  };

  override async load(): Promise<Result<DataOf<Menu>, DomainError>> {
    return ok({});
  }
}
