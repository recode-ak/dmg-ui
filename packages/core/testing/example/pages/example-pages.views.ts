import { PageViews } from '../../page/client/page-views';
import { ExampleUiSetDef } from '../example-ui.set';
import { AssignedTasksView } from './assigned-tasks.view';
import { TaskCardView } from './task-card.view';
import { TaskListView } from './task-list.view';
import { TaskAssignedView, TaskCompletedView } from './task-notes.view';

/** Представления учебного примера на страницах: все экраны и уведомления. */
export const examplePageViews = PageViews.of(ExampleUiSetDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  TaskAssignedView,
  TaskCompletedView,
]);
