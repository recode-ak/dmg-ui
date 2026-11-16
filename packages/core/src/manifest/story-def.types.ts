import type { DeclaredCaller, DefSpec, DefTexts } from 'dmg-core';
import type { AnyScreenDef } from './screen-def.types';
import type { ScreenExit } from './screen-exit';
import type { StoryDef } from './story-def';

/** Исход сторис: какие выходы экранов к нему ведут. */
export type OutcomeSpec = {
  readonly label: string;
  readonly description: string;
  readonly exits: readonly ScreenExit[];
};

/** Спека сторис: кто, зачем, с какого экрана и чем заканчивается. */
export type StorySpec<N extends string = string> = DefSpec<N> & {
  /** Допустимые вызывающие; что они ⊆ `callers` UC — правило Ф3. */
  readonly callers: readonly [DeclaredCaller, ...DeclaredCaller[]];
  /** Цель в форме «чтобы …». */
  readonly goal: string;
  readonly start: AnyScreenDef;
  readonly screens: readonly AnyScreenDef[];
  readonly outcomes: Readonly<Record<string, OutcomeSpec>>;
};

/** Любой Def сторис — структурный тип публичных членов. */
export type AnyStoryDef = {
  readonly [K in keyof StoryDef]: StoryDef[K];
};

/** Сериализуемая форма исхода; выходы — `<экран>.<выход>`. */
export type NormalizedOutcome = DefTexts & {
  readonly exits: readonly string[];
};

/** Сериализуемая форма сторис; ссылки — именами. */
export type NormalizedStory = DefTexts & {
  readonly dmg: 'story';
  readonly visible: boolean;
  readonly callers: readonly DeclaredCaller[];
  readonly goal: string;
  readonly start: string;
  readonly screens: readonly string[];
  readonly outcomes: readonly NormalizedOutcome[];
};
