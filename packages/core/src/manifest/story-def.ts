import { type DeclaredCaller, Def } from 'dmg-core';
import type { AnyScreenDef } from './screen-def.types';
import type {
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
 * сторис не владеет — ссылается на экраны UI-модуля.
 */
export class StoryDef<N extends string = string> extends Def<N> {
  readonly dmg = 'story';
  readonly callers: readonly [DeclaredCaller, ...DeclaredCaller[]];
  readonly goal: string;
  readonly start: AnyScreenDef;
  readonly screens: readonly AnyScreenDef[];
  readonly outcomes: Readonly<Record<string, OutcomeSpec>>;

  constructor(spec: StorySpec<N>) {
    super(spec);
    this.callers = spec.callers;
    this.goal = spec.goal;
    this.start = spec.start;
    this.screens = spec.screens;
    this.outcomes = spec.outcomes;
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
    };
  }
}
