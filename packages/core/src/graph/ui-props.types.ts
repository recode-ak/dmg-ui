import type { NormalizedRule } from 'dmg-core';
import type { NormalizedSchema } from '../manifest/normalized.types';

/** Тексты элемента `props`: исход, выход, локальное действие, вход, подтверждение. */
export type UiItemProps = {
  readonly label: string;
  readonly description: string;
};

/** Выход экрана в `props` исхода сторис: `id` экрана и имя выхода. */
export type UiOutcomeExitProps = {
  readonly screen: string;
  readonly exit: string;
};

/** Цель исхода в `props`: `back`, `home` или адрес — `id` экрана и параметры. */
export type UiOutcomeAfterProps =
  | 'back'
  | 'home'
  | { readonly screen: string; readonly params: unknown };

export type UiOutcomeProps = UiItemProps & {
  readonly name: string;
  readonly exits: readonly UiOutcomeExitProps[];
  /** Всегда есть: умолчание `back` видно в графе. */
  readonly after: UiOutcomeAfterProps;
};

export type UiLocalProps = UiItemProps & {
  readonly name: string;
  /** Подсказка; без неё ключа нет. */
  readonly hint?: string;
  readonly input?: NormalizedSchema;
};

export type UiExitProps = UiItemProps & {
  readonly name: string;
  readonly data?: NormalizedSchema;
};

export type UiEntryProps = UiItemProps & {
  readonly name: string;
  /** `id` экрана входа. */
  readonly screen: string;
  readonly params: unknown;
};

/** `props` узла `uiSet`. */
export type UiSetProps = {
  readonly app: string;
};

/** `props` узла `uiModule` (D-UI-119). */
export type UiModuleProps = {
  /** Раздел (`true`) или вспомогательный модуль; считается на наборе. */
  readonly section: boolean;
};

/** `props` узла `story`. */
export type UiStoryProps = {
  /** Подсказка; без неё ключа нет. */
  readonly hint?: string;
  readonly callers: readonly string[];
  readonly goal: string;
  /** `id` экрана старта. */
  readonly start: string;
  readonly outcomes: readonly UiOutcomeProps[];
  /** Правило доступа, свёрнутое, как `policy` UC; без доступа ключа нет. */
  readonly access?: NormalizedRule;
};

/** `props` узла `screen`; порядок ключей фиксирован. */
export type UiScreenProps = {
  /** Подсказка; без неё ключа нет. */
  readonly hint?: string;
  readonly params: NormalizedSchema;
  readonly state?: NormalizedSchema;
  readonly primary?: string;
  readonly locals: readonly UiLocalProps[];
  readonly exits: readonly UiExitProps[];
  readonly examples: readonly string[];
};

/** `props` узла `action`. */
export type UiActionProps = {
  /** Подсказка; без неё ключа нет. */
  readonly hint?: string;
  readonly input?: NormalizedSchema;
  readonly confirm?: UiItemProps;
};

/** Получатели в `props` уведомления; UC варианта `query` — ребро `recipients`. */
export type UiRecipientsProps =
  | { readonly from: 'payload'; readonly fields: readonly string[] }
  | {
      readonly from: 'query';
      readonly input: Readonly<Record<string, string>>;
      readonly fields: readonly string[];
    };

/** `props` узла `notification`. */
export type UiNotificationProps = {
  readonly recipients: UiRecipientsProps;
  readonly examples: readonly string[];
};

/** `props` узла `uiApp`. */
export type UiAppProps = {
  /** `id` набора UI. */
  readonly set: string;
  readonly channel: string;
  /** `id` корневых сторис дерева приложения (`StoryTree`); без сторис — пусто. */
  readonly roots: readonly string[];
  readonly entries: readonly UiEntryProps[];
};

/** Запись перечитывания в `props` ребра `refreshedBy`. */
export type UiRefreshRecordProps = {
  readonly params: Readonly<Record<string, string>>;
  readonly subject?: string;
  readonly any: boolean;
};

/** `props` ребра `refreshedBy`: все записи экрана на одно событие. */
export type UiRefreshedByProps = {
  readonly records: readonly UiRefreshRecordProps[];
};
