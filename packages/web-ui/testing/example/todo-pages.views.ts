import { TodoUiModuleDef } from 'dmg-ui/testing';
import { PageViews } from 'dmg-ui/web-ui';
import { AssignedTasksView } from './assigned-tasks.view';
import { MainMenuView } from './main-menu.view';
import { TaskAssignedView } from './task-assigned.view';
import { TaskCardView } from './task-card.view';
import { TaskCompletedView } from './task-completed.view';
import { TaskListView } from './task-list.view';

/** Представления модуля `todo` учебного примера на страницах. */
export const todoPagesViews = PageViews.of(TodoUiModuleDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  MainMenuView,
  TaskAssignedView,
  TaskCompletedView,
]);
