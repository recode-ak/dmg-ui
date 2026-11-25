import type { ProfileCodeOverrides } from '../frontend/profile/logic';
import type { TodoCodeOverrides } from '../frontend/todo/logic';
import type { UsersCodeOverrides } from '../frontend/users/logic';

/**
 * Подмена кода экранов и уведомлений примера (тесты): пересечение подмен
 * модулей `todo`, `users` и `profile`; без поля — код примера.
 */
export type ExampleCodeOverrides = TodoCodeOverrides &
  UsersCodeOverrides &
  ProfileCodeOverrides;
