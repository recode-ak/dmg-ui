import type {
  UiFileKind,
  UiPlaceZone,
  UiZoneWords,
} from './ui-file-names.types';

/** Словарь видов `NM-01` — таблица `naming.md` §1; наружу из `dmg-ui/testing` не выходит. */
export const UI_FILE_KINDS: readonly UiFileKind[] = [
  {
    suffix: 'set',
    zone: 'ui',
    ending: 'SetDef',
    head: 'pascal',
    declaration: { base: 'UiSetDef', form: 'define', label: 'UiSetDef' },
  },
  {
    suffix: 'ui-module',
    zone: 'ui',
    ending: 'UiModuleDef',
    head: 'pascal',
    declaration: { base: 'UiModuleDef', form: 'define', label: 'UiModuleDef' },
  },
  {
    suffix: 'story',
    zone: 'ui',
    ending: 'StoryDef',
    head: 'pascal',
    declaration: { base: 'StoryDef', form: 'define', label: 'StoryDef' },
  },
  {
    suffix: 'screen',
    zone: 'ui',
    ending: 'ScreenDef',
    head: 'pascal',
    declaration: { base: 'ScreenDef', form: 'define', label: 'ScreenDef' },
  },
  {
    suffix: 'notification',
    zone: 'ui',
    ending: 'NotificationDef',
    head: 'pascal',
    declaration: {
      base: 'NotificationDef',
      form: 'define',
      label: 'NotificationDef',
    },
  },
  {
    suffix: 'scode',
    zone: 'logic',
    pairs: ['screen'],
    ending: 'ScreenCode',
    head: 'pascal',
    declaration: { base: 'ScreenCode', form: 'extends', label: 'кода экрана' },
  },
  {
    suffix: 'ncode',
    zone: 'logic',
    pairs: ['notification'],
    ending: 'NotificationCode',
    head: 'pascal',
    declaration: {
      base: 'NotificationCode',
      form: 'extends',
      label: 'кода уведомления',
    },
  },
  {
    suffix: 'ui-app',
    zone: 'shell',
    ending: 'UiAppDef',
    head: 'pascal',
    declaration: { base: 'UiAppDef', form: 'define', label: 'UiAppDef' },
  },
  {
    suffix: 'view',
    zone: 'channel',
    pairs: ['screen', 'notification'],
    ending: 'View',
    head: 'pascal',
  },
  { suffix: 'views', zone: 'channel', ending: 'Views', head: 'camel' },
  { suffix: 'routes', zone: 'shell', ending: 'Routes', head: 'camel' },
  {
    suffix: 'placements',
    zone: 'shell',
    ending: 'Placements',
    head: 'camel',
  },
  { suffix: 'wire', zone: 'shell', ending: 'Wire', head: 'camel' },
  { suffix: 'graph', zone: 'shell', ending: 'Graph', head: 'pascal' },
  { suffix: 'arch', zone: 'shell', ending: 'Arch', head: 'pascal' },
];

/** Папка общих экранов модуля в описании (экран двух и больше сторис) и в его зеркалах; имя сторис `shared` занято. */
export const SHARED_FOLDER = 'shared';

/** Слова зон в тексте нарушения места: чей вид («вид описания») и где лежит файл («в описании»). */
export const UI_ZONE_WORDS: Readonly<Record<UiPlaceZone, UiZoneWords>> = {
  ui: { of: 'описания', at: 'в описании' },
  logic: { of: 'кода модуля', at: 'в коде модуля' },
  channel: { of: 'канала модуля', at: 'в канале модуля' },
  shell: { of: 'оболочки', at: 'в оболочке' },
  kit: { of: 'kit', at: 'в kit' },
};
