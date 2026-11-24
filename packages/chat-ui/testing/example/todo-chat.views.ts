import { ChatViews } from 'dmg-ui/chat-ui';
import { TodoUiModuleDef } from 'dmg-ui/testing';
import { AssignedTasksView } from './assigned-tasks.view';
import { MainMenuView } from './main-menu.view';
import { TaskAssignedView } from './task-assigned.view';
import { TaskCardView } from './task-card.view';
import { TaskCompletedView } from './task-completed.view';
import { TaskListView } from './task-list.view';

/** Представления модуля `todo` учебного примера в диалоговом канале. */
export const todoChatViews = ChatViews.of(TodoUiModuleDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  MainMenuView,
  TaskAssignedView,
  TaskCompletedView,
]);
