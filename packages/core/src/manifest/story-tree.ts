import { UiIds } from '../address/ui-ids';
import type { AnyStoryDef } from './story-def.types';
import type { OmittedStory, StoryBranch } from './story-tree.types';
import type { AnyUiAppDef } from './ui-app-def.types';

export type { OmittedStory, StoryBranch } from './story-tree.types';

/**
 * Дерево сторис приложения UI для меню канала и для графа: корни, порядок
 * потомков и отрезанное. Одно решение для канала и графа (граф берёт у него
 * `roots`, второго обхода нет). Дерево несёт объявленное в Def — `access` и
 * `rules` как есть; доступ для субъекта оно не вычисляет и субъекта не
 * принимает (D-UI-94, D-UI-101).
 */
export class StoryTree {
  private readonly branches: StoryBranch[] = [];
  private readonly cut: OmittedStory[] = [];
  private readonly cutIds = new Set<string>();
  private readonly shown = new Set<AnyStoryDef>();
  private readonly inside: ReadonlySet<AnyStoryDef>;

  private constructor(
    private readonly app: AnyUiAppDef,
    private readonly ids: UiIds,
  ) {
    this.inside = new Set(app.stories);
    this.build();
  }

  static of(app: AnyUiAppDef): StoryTree {
    return new StoryTree(app, new UiIds(app.set));
  }

  /**
   * Корни: сторис приложения, на которые не ведёт связь другой сторис
   * приложения, — в порядке приложения. Сторис из цикла без корня идут
   * корнями в порядке приложения: ни одна сторис не пропадает.
   */
  roots(): readonly StoryBranch[] {
    return this.branches;
  }

  /**
   * Сторис вне приложения, в которые ведут связи его сторис, — по одной;
   * `from` — первая по обходу сторис, из связей которой она выпала.
   */
  omitted(): readonly OmittedStory[] {
    return this.cut;
  }

  private build(): void {
    const led = this.led();
    for (const story of this.app.stories) {
      if (!led.has(story)) this.branches.push(this.branch(story));
    }
    for (const story of this.app.stories) {
      if (!this.shown.has(story)) this.branches.push(this.branch(story));
    }
  }

  /** Сторис приложения, в которые ведёт другая сторис приложения. */
  private led(): Set<AnyStoryDef> {
    const led = new Set<AnyStoryDef>();
    for (const story of this.app.stories) {
      for (const lead of story.leads()) {
        if (lead !== story && this.inside.has(lead)) led.add(lead);
      }
    }
    return led;
  }

  /** Узел сторис: первый раз — с потомками, повтор — `again` без них. */
  private branch(story: AnyStoryDef): StoryBranch {
    const again = this.shown.has(story);
    this.shown.add(story);
    return {
      id: this.ids.story(story),
      name: story.name,
      label: story.label,
      description: story.description,
      ...(story.hint === undefined ? {} : { hint: story.hint }),
      goal: story.goal,
      ...(story.access === undefined
        ? {}
        : { access: story.access.normalize() }),
      rules: story.rules.map((rule) => rule.name),
      again,
      children: again ? [] : this.children(story),
    };
  }

  private children(story: AnyStoryDef): StoryBranch[] {
    const children: StoryBranch[] = [];
    for (const lead of story.leads()) {
      if (this.inside.has(lead)) {
        children.push(this.branch(lead));
      } else {
        this.cutOff(lead, story);
      }
    }
    return children;
  }

  private cutOff(lead: AnyStoryDef, from: AnyStoryDef): void {
    const id = this.ids.target(lead);
    if (this.cutIds.has(id)) return;
    this.cutIds.add(id);
    this.cut.push({ id, from: this.ids.story(from) });
  }
}
