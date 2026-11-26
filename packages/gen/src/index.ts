/**
 * Вход `dmg-ui/dmg-core` — виды `dmg-core gen` поставщика `dmg-ui` (D-113
 * `dmg-core`): ядро находит экспорт `gen` у пакетов из `providers` конфига
 * проекта и запускает вид по имени.
 */
import type { GenProvider } from 'dmg-core/gen';
import { NotificationKind } from './notification-kind';
import { ScreenKind } from './screen-kind';
import { StoryKind } from './story-kind';
import { UiModuleKind } from './ui-module-kind';

export const gen: GenProvider = {
  kinds: [
    new UiModuleKind(),
    new StoryKind(),
    new ScreenKind(),
    new NotificationKind(),
  ],
};
