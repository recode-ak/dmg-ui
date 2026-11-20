import type { UiFileKind } from './ui-file-names.types';

/** Словарь видов `NM-01` — таблица `naming.md` §1; наружу из `dmg-ui/testing` не выходит. */
export const UI_FILE_KINDS: readonly UiFileKind[] = [
  {
    suffix: 'set',
    side: 'set',
    ending: 'SetDef',
    head: 'pascal',
    declaration: { base: 'UiSetDef', form: 'define', label: 'UiSetDef' },
  },
  {
    suffix: 'ui-module',
    side: 'set',
    ending: 'UiModuleDef',
    head: 'pascal',
    declaration: { base: 'UiModuleDef', form: 'define', label: 'UiModuleDef' },
  },
  {
    suffix: 'story',
    side: 'set',
    ending: 'StoryDef',
    head: 'pascal',
    declaration: { base: 'StoryDef', form: 'define', label: 'StoryDef' },
  },
  {
    suffix: 'screen',
    side: 'set',
    ending: 'ScreenDef',
    head: 'pascal',
    declaration: { base: 'ScreenDef', form: 'define', label: 'ScreenDef' },
  },
  {
    suffix: 'notification',
    side: 'set',
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
    side: 'set',
    ending: 'ScreenCode',
    head: 'pascal',
    declaration: { base: 'ScreenCode', form: 'extends', label: 'кода экрана' },
  },
  {
    suffix: 'ncode',
    side: 'set',
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
    side: 'channel',
    ending: 'UiAppDef',
    head: 'pascal',
    declaration: { base: 'UiAppDef', form: 'define', label: 'UiAppDef' },
  },
  { suffix: 'view', side: 'channel', ending: 'View', head: 'pascal' },
  { suffix: 'views', side: 'channel', ending: 'Views', head: 'camel' },
  { suffix: 'routes', side: 'channel', ending: 'Routes', head: 'camel' },
  {
    suffix: 'placements',
    side: 'channel',
    ending: 'Placements',
    head: 'camel',
  },
  { suffix: 'wire', side: 'channel', ending: 'Wire', head: 'camel' },
  { suffix: 'graph', side: 'channel', ending: 'Graph', head: 'pascal' },
  { suffix: 'arch', side: 'channel', ending: 'Arch', head: 'pascal' },
];
