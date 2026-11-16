import { DialogViews } from '../../dialog';
import { ExampleUiSetDef } from '../example-ui.set';
import { AssignedTasksView } from './assigned-tasks.view';
import { TaskCardView } from './task-card.view';
import { TaskListView } from './task-list.view';
import { TaskAssignedView, TaskCompletedView } from './task-notes.view';

/** Представления учебного примера в диалоговом канале: все экраны и уведомления. */
export const exampleDialogViews = DialogViews.of(ExampleUiSetDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  TaskAssignedView,
  TaskCompletedView,
]);
