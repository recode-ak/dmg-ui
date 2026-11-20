import { ExampleUiSetDef } from 'dmg-ui/testing';
import { AssignedTasksView } from './assigned-tasks.view';
import { ExampleViews } from './example-views';
import { MainMenuView } from './main-menu.view';
import { TaskAssignedView } from './task-assigned.view';
import { TaskCardView } from './task-card.view';
import { TaskCompletedView } from './task-completed.view';
import { TaskListView } from './task-list.view';
import { UserCardView } from './user-card.view';

/** Готовый реестр примера: пять экранов и два уведомления учебного набора; меню — только заголовок. */
export const exampleWebViews = ExampleViews.of(ExampleUiSetDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  UserCardView,
  MainMenuView,
  TaskAssignedView,
  TaskCompletedView,
]);
