import { todoChatViews } from 'dmg-ui/chat-ui/testing';
import { TaskCardView } from './task-card.view';
import { TaskListView } from './task-list.view';

/**
 * Представления модуля `todo` под Telegram (D-UI-67): общие `todoChatViews`,
 * у списка и карточки — перекрытие; остальные экраны и уведомления общие.
 */
export const todoTelegramViews = todoChatViews.over([
  TaskListView,
  TaskCardView,
]);
