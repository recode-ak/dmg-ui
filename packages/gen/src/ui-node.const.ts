import type { UiNodeSpec } from './ui-node.types';

/** Пакет схем: `import * as v` в описаниях узлов */
export const VALIBOT = 'valibot';

/** Папка общих экранов и уведомлений модуля */
export const SHARED_FOLDER = 'shared';

/** Экран: выход `done` — на него ссылается исход сторис */
export const SCREEN_NODE: UiNodeSpec = {
  kind: 'screen',
  subject: 'Экран',
  part: 'Screen',
  codeSuffix: 'scode',
  list: 'screens',
  body: (name) => [
    `name: '${name}',`,
    "label: 'TODO: название экрана',",
    "description: 'TODO: что человек видит и делает на экране',",
    'reads: [],',
    'data: v.object({}),',
    'exits: {',
    '  done: {',
    "    label: 'TODO: итог экрана',",
    "    description: 'TODO: когда экран завершён',",
    '  },',
    '},',
  ],
  sharedNote: (def) =>
    `Экран в shared: добавь ${def} в screens сторис, которые его открывают.`,
  storyNote: (def) =>
    `Открой ${def} действием-переходом (to) с экрана сторис — иначе он недостижим (UI-07).`,
};

/** Уведомление: без `event` — событие домена генератор не знает */
export const NOTIFICATION_NODE: UiNodeSpec = {
  kind: 'notification',
  subject: 'Уведомление',
  part: 'Notification',
  codeSuffix: 'ncode',
  list: 'notifications',
  body: (name) => [
    `name: '${name}',`,
    "label: 'TODO: заголовок уведомления',",
    "description: 'TODO: о чём уведомление',",
    '// TODO: event — событие домена, по которому приходит уведомление.',
    "recipients: { from: 'payload', fields: [] },",
    'reads: [],',
    'data: v.object({}),',
  ],
  fileNote: (path) =>
    `Заполни event (событие домена) в ${path} — без него файл не соберётся.`,
};
