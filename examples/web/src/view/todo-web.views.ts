import { TodoUiModuleDef } from 'dmg-ui/testing';
import { AssignedTasksView } from './assigned-tasks.view';
import { ExampleViews } from './example-views';
import { MainMenuView } from './main-menu.view';
import { TaskAssignedView } from './task-assigned.view';
import { TaskCardView } from './task-card.view';
import { TaskCompletedView } from './task-completed.view';
import { TaskListView } from './task-list.view';

/** Представления модуля `todo` примера на DOM; меню — только заголовок. */
export const todoWebViews = ExampleViews.of(TodoUiModuleDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  MainMenuView,
  TaskAssignedView,
  TaskCompletedView,
]);
