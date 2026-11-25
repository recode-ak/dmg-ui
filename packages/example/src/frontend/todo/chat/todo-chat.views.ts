import { ChatViews } from 'dmg-ui/chat-ui';
import { TodoUiModuleDef } from '../../../platform/ui';
import { TaskCardView } from './finish-tasks/task-card.view';
import { AssignedTasksView } from './follow-assigned/assigned-tasks.view';
import { TaskAssignedView } from './shared/task-assigned.view';
import { TaskCompletedView } from './shared/task-completed.view';
import { TaskListView } from './shared/task-list.view';
import { MainMenuView } from './start-work/main-menu.view';

/** Представления модуля `todo` учебного примера в диалоговом канале. */
export const todoChatViews = ChatViews.of(TodoUiModuleDef, [
  TaskListView,
  TaskCardView,
  AssignedTasksView,
  MainMenuView,
  TaskAssignedView,
  TaskCompletedView,
]);
