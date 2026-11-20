import { exampleDialogViews } from 'dmg-ui/chat-ui/testing';
import { TaskCardView } from './task-card.view';
import { TaskListView } from './task-list.view';

/**
 * Представления учебного примера под Telegram (D-UI-67): общие
 * `exampleDialogViews`, у списка и карточки — перекрытие; остальные экраны
 * и уведомления остаются общими.
 */
export const exampleTelegramViews = exampleDialogViews.over([
  TaskListView,
  TaskCardView,
]);
