import {
  type AnyDomainRule,
  type AnyRule,
  type DeclaredCaller,
  Def,
} from 'dmg-core';
import type { AnyScreenDef } from './screen-def.types';
import type {
  AnyStoryDef,
  NormalizedStory,
  OutcomeSpec,
  StorySpec,
} from './story-def.types';

export type {
  AnyStoryDef,
  NormalizedOutcome,
  NormalizedStory,
  OutcomeSpec,
  StorySpec,
} from './story-def.types';

/**
 * Манифест сторис: путь пользователя по экранам модуля к исходам. Экраны
 * сторис не владеет — ссылается на экраны UI-модуля. Связи (`leads`) — в
 * какие сторис она ведёт; доступ и правила — ссылки на объекты домена.
 */
export class StoryDef<N extends string = string> extends Def<N> {
  readonly dmg = 'story';
  readonly callers: readonly [DeclaredCaller, ...DeclaredCaller[]];
  readonly goal: string;
  readonly start: AnyScreenDef;
  readonly screens: readonly AnyScreenDef[];
  readonly outcomes: Readonly<Record<string, OutcomeSpec>>;
  /** Сторис из связей; раскрывает thunk спеки, без связей — пусто. */
  readonly leads: () => readonly AnyStoryDef[];
  readonly access: AnyRule | undefined;
  readonly rules: readonly AnyDomainRule[];

  constructor(spec: StorySpec<N>) {
    super(spec);
    this.callers = spec.callers;
    this.goal = spec.goal;
    this.start = spec.start;
    this.screens = spec.screens;
    this.outcomes = spec.outcomes;
    this.leads = spec.leads ?? (() => []);
    this.access = spec.access;
    this.rules = spec.rules ?? [];
  }

  static define<const N extends string>(spec: StorySpec<N>): StoryDef<N> {
    return new StoryDef<N>(spec);
  }

  normalize(): NormalizedStory {
    return {
      dmg: this.dmg,
      ...this.texts(),
      visible: this.visible,
      callers: this.callers,
      goal: this.goal,
      start: this.start.name,
      screens: this.screens.map((s) => s.name),
      outcomes: Object.entries(this.outcomes).map(([name, o]) => ({
        name,
        label: o.label,
        description: o.description,
        exits: o.exits.map((e) => `${e.screen.name}.${e.name}`),
      })),
      leads: this.leads().map((story) => story.name),
      rules: this.rules.map((rule) => rule.name),
      ...(this.access === undefined ? {} : { access: this.access.normalize() }),
    };
  }
}
