import type { PagePlacement } from 'dmg-ui/web-ui';
import { TaskCardScreenDef } from '../../platform/ui';

/**
 * Размещение «окно над списком задач»: карточка задачи открывается в области
 * `modal`, остальные экраны — по умолчанию канала. Приложение и умолчание
 * «из корня — в панель» не меняются: размещение передаёт сборка вкладки.
 */
export const exampleWindowPlacements: readonly PagePlacement[] = [
  { screen: TaskCardScreenDef, region: 'modal' },
];
