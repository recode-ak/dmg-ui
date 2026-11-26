/**
 * Вход `dmg-ui/dmg-core` — виды `dmg-core gen` поставщика `dmg-ui` (D-113
 * `dmg-core`): ядро находит экспорт `gen` у пакетов из `providers` конфига
 * проекта и запускает вид по имени.
 */
import type { GenProvider } from 'dmg-core/gen';
import { UiModuleKind } from './ui-module-kind';

export const gen: GenProvider = { kinds: [new UiModuleKind()] };
