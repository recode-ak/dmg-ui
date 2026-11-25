import { TodoUiModuleDef } from '../../../platform/ui';
import { ExampleViews } from '../../web-kit/example-views';
import { TaskCardView } from './finish-tasks/task-card.view';
import { AssignedTasksView } from './follow-assigned/assigned-tasks.view';
import { TaskAssignedView } from './shared/task-assigned.view';
import { TaskCompletedView } from './shared/task-completed.view';
import { TaskListView } from './shared/task-list.view';
import { MainMenuView } from './start-work/main-menu.view';

/** Представления модуля `todo` примера на DOM; меню — только заголовок. */
export const todoWebViews = ExampleViews.of(TodoUiModuleDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  MainMenuView,
  TaskAssignedView,
  TaskCompletedView,
]);
