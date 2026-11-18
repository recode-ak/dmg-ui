import { AssignedTasksScreenDef } from 'dmg-ui/testing';
import type { PagePlacement } from 'dmg-ui/web-ui';

/**
 * Размещение экранов: «Назначенные мне» открываются окном (по ссылке
 * уведомления), прочие — по положению: список в основной области, карточка
 * в соседней.
 */
export const EXAMPLE_PLACEMENTS: readonly PagePlacement[] = [
  { screen: AssignedTasksScreenDef, region: 'modal' },
];
