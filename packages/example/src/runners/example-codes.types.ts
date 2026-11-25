import type { TodoCodeOverrides } from '../frontend/todo/logic/todo-codes.types';
import type { UsersCodeOverrides } from '../frontend/users/logic/users-codes.types';

/**
 * Подмена кода экранов и уведомлений примера (тесты): пересечение подмен
 * модулей `todo` и `users`; без поля — код примера.
 */
export type ExampleCodeOverrides = TodoCodeOverrides & UsersCodeOverrides;
