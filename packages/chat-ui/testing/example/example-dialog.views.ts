import { ChatViews } from 'dmg-ui/chat-ui';
import { ExampleUiSetDef } from 'dmg-ui/testing';
import { AssignedTasksView } from './assigned-tasks.view';
import { MainMenuView } from './main-menu.view';
import { TaskCardView } from './task-card.view';
import { TaskListView } from './task-list.view';
import { TaskAssignedView, TaskCompletedView } from './task-notes.view';
import { UserCardView } from './user-card.view';

/** Представления учебного примера в диалоговом канале: все экраны и уведомления. */
export const exampleDialogViews = ChatViews.of(ExampleUiSetDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  UserCardView,
  MainMenuView,
  TaskAssignedView,
  TaskCompletedView,
]);
