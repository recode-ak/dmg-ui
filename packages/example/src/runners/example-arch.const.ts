import { join } from 'node:path';
import type { ArchApp } from 'dmg-core/arch';
import type { UiChannelSpec } from 'dmg-ui/graph';

const PROJECT = join(import.meta.dir, '../..');
const SRC = join(PROJECT, 'src');

/**
 * Каналы учебного проекта: диалог, Telegram поверх диалога и страницы.
 * Граф от каналов не зависит — они задают только слои фронта, поэтому оба
 * графа проекта проверяют одни и те же слои.
 */
export const EXAMPLE_CHANNELS: readonly UiChannelSpec[] = [
  { name: 'chat' },
  { name: 'telegram', base: 'chat' },
  { name: 'web' },
];

/**
 * Места слоёв и раннеры учебного проекта, общие для графов `dialog` и `web`
 * (ARC-13). Каталоги слоёв `fe-app` и `chat-kit` названы, но файлов в них
 * нет: набор проекта их не заводит.
 */
export const EXAMPLE_PLACES: Pick<ArchApp, 'project' | 'runners' | 'layers'> = {
  project: PROJECT,
  runners: [join(SRC, 'runners')],
  layers: {
    ui: [join(SRC, 'platform', 'ui')],
    'fe-app': [join(SRC, 'frontend', 'app')],
    'fe-logic': [join(SRC, 'frontend', '{m}', 'logic')],
    'fe-chat': [join(SRC, 'frontend', '{m}', 'chat')],
    'chat-kit': [join(SRC, 'frontend', 'chat-kit')],
    'fe-telegram': [join(SRC, 'frontend', '{m}', 'telegram')],
    'telegram-kit': [join(SRC, 'frontend', 'telegram-kit')],
    'fe-web': [join(SRC, 'frontend', '{m}', 'web')],
    'web-kit': [join(SRC, 'frontend', 'web-kit')],
  },
};
