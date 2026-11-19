import { ExampleUiSetDef } from 'dmg-ui/testing';
import { PageViews } from 'dmg-ui/web-ui';
import { AssignedTasksView } from './assigned-tasks.view';
import { TaskCardView } from './task-card.view';
import { TaskListView } from './task-list.view';
import { TaskAssignedView, TaskCompletedView } from './task-notes.view';
import { UserCardView } from './user-card.view';

/** Представления учебного примера на страницах: все экраны и уведомления. */
export const examplePageViews = PageViews.of(ExampleUiSetDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  UserCardView,
  TaskAssignedView,
  TaskCompletedView,
]);
