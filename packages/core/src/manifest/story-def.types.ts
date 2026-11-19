import type {
  AnyDomainRule,
  AnyRule,
  DeclaredCaller,
  DefSpec,
  DefTexts,
  NormalizedRule,
} from 'dmg-core';
import type { Address } from '../address/address';
import type { AnyScreenDef } from './screen-def.types';
import type { ScreenExit } from './screen-exit';
import type { StoryDef } from './story-def';

/**
 * Куда ведёт исход: `back` — туда, откуда человек пришёл, с перечитыванием;
 * `home` — вход «в начало» приложения UI; адрес — экран по адресу.
 */
export type OutcomeAfter = 'back' | 'home' | Address;

/** Исход сторис: какие выходы экранов к нему ведут и куда после него. */
export type OutcomeSpec = {
  readonly label: string;
  readonly description: string;
  readonly exits: readonly ScreenExit[];
  /** Цель исхода; без неё — `back`. */
  readonly after?: OutcomeAfter;
};

/** Спека сторис: кто, зачем, с какого экрана и чем заканчивается. */
export type StorySpec<N extends string = string> = DefSpec<N> & {
  /** Допустимые вызывающие; что они ⊆ `callers` UC — правило графа. */
  readonly callers: readonly [DeclaredCaller, ...DeclaredCaller[]];
  /** Цель в форме «чтобы …». */
  readonly goal: string;
  readonly start: AnyScreenDef;
  readonly screens: readonly AnyScreenDef[];
  readonly outcomes: Readonly<Record<string, OutcomeSpec>>;
  /**
   * Сторис, в которые ведёт эта; переход в связанную сторис — на её `start`.
   * Thunk с аннотацией возврата, как `to` действия: взаимные связи сторис
   * без отложенного вызова падают при импорте.
   */
  readonly leads?: () => readonly AnyStoryDef[];
  /**
   * Право субъекта на сторис — правило Policy домена (тот же объект, что
   * исполняет UC), не копия. Вычисляется по субъекту, здесь только объявлено.
   */
  readonly access?: AnyRule;
  /** Доменные правила, которые сторис показывает человеку; их проверяют UC домена. */
  readonly rules?: readonly AnyDomainRule[];
};

/** Любой Def сторис — структурный тип публичных членов. */
export type AnyStoryDef = {
  readonly [K in keyof StoryDef]: StoryDef[K];
};

/** Сериализуемая цель исхода: адрес — экран именем и параметры. */
export type NormalizedAfter =
  | 'back'
  | 'home'
  | { readonly screen: string; readonly params: unknown };

/** Сериализуемая форма исхода; выходы — `<экран>.<выход>`, цель — всегда. */
export type NormalizedOutcome = DefTexts & {
  readonly exits: readonly string[];
  readonly after: NormalizedAfter;
};

/** Сериализуемая форма сторис; ссылки — именами, доступ — свёрнутым правилом. */
export type NormalizedStory = DefTexts & {
  readonly dmg: 'story';
  readonly visible: boolean;
  readonly callers: readonly DeclaredCaller[];
  readonly goal: string;
  readonly start: string;
  readonly screens: readonly string[];
  readonly outcomes: readonly NormalizedOutcome[];
  /** Имена сторис из связей. */
  readonly leads: readonly string[];
  /** Имена доменных правил. */
  readonly rules: readonly string[];
  /** Свёрнутое правило доступа; без доступа ключа нет. */
  readonly access?: NormalizedRule;
};
