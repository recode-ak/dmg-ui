import type { ExampleUser } from 'dmg-core/testing/example';
import { OWNER } from './todo/shared/example-tasks';

/**
 * Субъект примеров — свойство контекста превью проекта, а не Def: владелец
 * задач, которые показывают примеры экранов, без ролей. С ним примеры
 * показывают действия, которые решает Policy (без субъекта они скрыты).
 */
export const exampleSubject: ExampleUser = {
  uuid: OWNER,
  hasRole: () => false,
};
