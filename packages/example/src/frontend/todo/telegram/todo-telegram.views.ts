import { todoChatViews } from '../chat/todo-chat.views';
import { TaskCardView } from './finish-tasks/task-card.view';
import { TaskListView } from './shared/task-list.view';

/**
 * Представления модуля `todo` под Telegram (D-UI-67): общие `todoChatViews`,
 * у списка и карточки — перекрытие; остальные экраны и уведомления общие.
 */
export const todoTelegramViews = todoChatViews.over([
  TaskListView,
  TaskCardView,
]);
