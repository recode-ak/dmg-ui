import type { GraphKinds } from 'dmg-core/graph';
import { UI_PROPS } from './ui-props';

/** Имя поставщика графа ядра UI. */
export const UI_PROVIDER = 'dmg-ui';

/**
 * Версия поставщика; равна `version` пакета (тест сверяет): импорт
 * `package.json` из `src` запрещён проверкой направлений.
 */
export const UI_VERSION = '0.5.1';

/** Префикс правил графа ядра UI: у каждого пакета канала свой. */
export const UI_RULE_PREFIX = 'UI';

// Литеральные типы нужны пакетам каналов: `as const` оставляет значения
// строками-литералами, а не `string`.

/** Имена видов узлов; совпадают с `dmg` Def, у действия Def нет. */
export const UI_NODE_KINDS = {
  set: 'uiSet',
  module: 'uiModule',
  story: 'story',
  screen: 'screen',
  action: 'action',
  notification: 'notification',
  app: 'uiApp',
} as const;

/** Имена видов рёбер; `presents` и `invokes` вправе ставить пакеты каналов. */
export const UI_EDGE_KINDS = {
  includes: 'includes',
  entry: 'entry',
  reads: 'reads',
  recipients: 'recipients',
  invokes: 'invokes',
  leadsTo: 'leadsTo',
  refreshedBy: 'refreshedBy',
  notifiedBy: 'notifiedBy',
  links: 'links',
  catches: 'catches',
  presents: 'presents',
  leads: 'leads',
  requires: 'requires',
  omits: 'omits',
  redirects: 'redirects',
} as const;

/** Виды узлов и рёбер ядра UI и схемы их свойств; данные, как `DOMAIN_KINDS`. */
export const UI_KINDS: GraphKinds = {
  nodes: [
    {
      kind: UI_NODE_KINDS.set,
      label: 'Набор UI',
      description: 'Набор UI-модулей одного доменного приложения.',
      props: UI_PROPS.uiSet,
    },
    {
      kind: UI_NODE_KINDS.module,
      label: 'UI-модуль',
      description: 'UI-модуль набора: экраны, сторис и уведомления.',
      props: UI_PROPS.uiModule,
    },
    {
      kind: UI_NODE_KINDS.story,
      label: 'Сторис',
      description: 'Путь пользователя по экранам модуля к исходам.',
      props: UI_PROPS.story,
    },
    {
      kind: UI_NODE_KINDS.screen,
      label: 'Экран',
      description: 'Экран: параметры адреса, состояние, выходы и примеры.',
      props: UI_PROPS.screen,
    },
    {
      kind: UI_NODE_KINDS.action,
      label: 'Действие экрана',
      description: 'Действие экрана: вызов command UC или переход.',
      props: UI_PROPS.action,
    },
    {
      kind: UI_NODE_KINDS.notification,
      label: 'Уведомление',
      description: 'Уведомление человеку по доменному событию.',
      props: UI_PROPS.notification,
    },
    {
      kind: UI_NODE_KINDS.app,
      label: 'Приложение UI',
      description: 'Набор UI в одном канале: сторис, уведомления и входы.',
      props: UI_PROPS.uiApp,
    },
  ],
  edges: [
    {
      kind: UI_EDGE_KINDS.includes,
      label: 'Включает',
      description:
        'Приложение UI включает сторис и уведомление, сторис включает экран.',
    },
    {
      kind: UI_EDGE_KINDS.entry,
      label: 'Вход',
      description: 'Приложение UI начинает работу с экрана.',
    },
    {
      kind: UI_EDGE_KINDS.reads,
      label: 'Читает UC',
      description: 'Экран или уведомление читает данные query UC.',
    },
    {
      kind: UI_EDGE_KINDS.recipients,
      label: 'Получатели из UC',
      description:
        'Уведомление берёт получателей из выхода query UC, вызванного системой.',
    },
    {
      kind: UI_EDGE_KINDS.invokes,
      label: 'Вызывает UC',
      description: 'Действие (или сигнал канала) вызывает command UC.',
    },
    {
      kind: UI_EDGE_KINDS.leadsTo,
      label: 'Ведёт на экран',
      description: 'Действие переводит пользователя на другой экран.',
    },
    {
      kind: UI_EDGE_KINDS.refreshedBy,
      label: 'Перечитывается по событию',
      description:
        'Экран перечитывает данные по событию; записи — в свойствах.',
      props: UI_PROPS.refreshedBy,
    },
    {
      kind: UI_EDGE_KINDS.notifiedBy,
      label: 'Уведомляется событием',
      description: 'Уведомление отправляется по доменному событию.',
    },
    {
      kind: UI_EDGE_KINDS.links,
      label: 'Ведёт на экран',
      description: 'Уведомление ведёт получателя на экран.',
    },
    {
      kind: UI_EDGE_KINDS.catches,
      label: 'Перехватывает ошибку',
      description: 'У экрана свой ответ на код отказа.',
    },
    {
      kind: UI_EDGE_KINDS.presents,
      label: 'Показывает',
      description:
        'Приложение UI показывает экран, уведомление или набор целиком; ставит пакет канала.',
    },
    {
      kind: UI_EDGE_KINDS.leads,
      label: 'Ведёт в сторис',
      description:
        'Сторис ведёт в другую сторис: переход на её стартовый экран.',
    },
    {
      kind: UI_EDGE_KINDS.requires,
      label: 'Требует правило',
      description:
        'Сторис показывает человеку доменное правило, которое проверяет UC.',
    },
    {
      kind: UI_EDGE_KINDS.omits,
      label: 'Не включает сторис',
      description:
        'Приложение UI не включает сторис из связей своих сторис: переходы в неё отрезаны.',
    },
    {
      kind: UI_EDGE_KINDS.redirects,
      label: 'Направляет исход',
      description:
        'Исход сторис ведёт на экран по адресу; цели «назад» и «в начало» ребра не дают.',
    },
  ],
};
