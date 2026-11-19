import type { NormalizedRule } from 'dmg-core';

/**
 * Узел дерева сторис приложения UI — данные JSON. `access` и `rules` —
 * объявленное в Def сторис, не вычисленное для субъекта.
 */
export type StoryBranch = {
  /** Тот же `id`, что у узла сторис в графе. */
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly hint?: string;
  readonly goal: string;
  /** Свёрнутое правило доступа сторис; без доступа ключа нет. */
  readonly access?: NormalizedRule;
  /** Имена доменных правил сторис. */
  readonly rules: readonly string[];
  /** Сторис уже показана полным узлом выше по обходу: здесь повтор без потомков. */
  readonly again: boolean;
  readonly children: readonly StoryBranch[];
};

/** Сторис, которой нет в приложении, и сторис приложения, из связей которой она выпала. */
export type OmittedStory = {
  readonly id: string;
  readonly from: string;
};
