import { exampleDialogViews } from 'dmg-ui/chat-ui/testing';
import { TaskCardTelegramView } from './task-card.telegram-view';
import { TaskListTelegramView } from './task-list.telegram-view';

/**
 * Представления учебного примера под Telegram (D-UI-67): общие
 * `exampleDialogViews`, у списка и карточки — перекрытие; остальные экраны
 * и уведомления остаются общими.
 */
export const exampleTelegramViews = exampleDialogViews.over([
  TaskListTelegramView,
  TaskCardTelegramView,
]);
