import type { ChannelTech } from './front-layout.types';

/** Слой описания UI */
export const UI_LAYER = 'ui';

/** Слой кода модуля */
export const LOGIC_LAYER = 'fe-logic';

/** Префикс слоёв фронта: `fe-<канал>`, `fe-app`, `fe-logic` */
export const FRONT_PREFIX = 'fe-';

/** Сборка реестров кода модулей в оболочке */
export const CODE_SHELL = 'AppCodeLoaders';

/** Слои `fe-*`, которые не каналы: общее фронта и код модуля */
export const TAKEN_CHANNELS: readonly string[] = ['app', 'logic'];

/** Канал на базе прочего канала держит только перекрытия — шаблон есть у каналов с технологией */
export const CHANNEL_TECHS: ReadonlyMap<string, ChannelTech> = new Map([
  [
    'chat',
    { factory: 'ChatViews', entry: 'dmg-ui/chat-ui', shell: 'AppChatViews' },
  ],
  [
    'web',
    { factory: 'PageViews', entry: 'dmg-ui/web-ui', shell: 'AppPageViews' },
  ],
]);
