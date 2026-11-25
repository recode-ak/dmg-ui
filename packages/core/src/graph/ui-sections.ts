import { GraphId } from 'dmg-core/graph';
import type { UiIds } from '../address/ui-ids';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { UiGraphReader } from './ui-graph-reader';
import type { SectionLink, SectionStory } from './ui-sections.types';

/**
 * Раздел и вспомогательный модуль набора по связям сторис (D-UI-119).
 *
 * - Корневая сторис набора — та, в которую не ведёт ни одна связь сторис
 *   набора; её связи не в счёт (меню, D-UI-96).
 * - Связь в счёте — из не корневой сторис другого модуля в сторис модуля;
 *   связь на сторис вне набора не в счёт.
 * - Раздел — у модуля есть сторис без связи в счёте; иначе модуль
 *   вспомогательный, в том числе без сторис.
 *
 * Алгоритм один на два входа: Def набора (`ofSet`, свойство `section` узла
 * модуля) и граф (`ofGraph`, правило UI-37).
 */
export class UiSections {
  private readonly byId: ReadonlyMap<string, SectionStory>;
  private readonly roots: ReadonlySet<string>;

  private constructor(private readonly stories: readonly SectionStory[]) {
    this.byId = new Map(stories.map((story) => [story.id, story]));
    const led = new Set(stories.flatMap((story) => story.leads));
    this.roots = new Set(
      stories.filter((story) => !led.has(story.id)).map((story) => story.id),
    );
  }

  /** По Def набора; `id` — через `UiIds`, связь вне набора — внешний `id`. */
  static ofSet(set: AnyUiSetDef, ids: UiIds): UiSections {
    return new UiSections(
      set.modules.flatMap((module) =>
        module.stories.map((story) => ({
          id: ids.story(story),
          module: ids.module(module),
          leads: story.leads().map((lead) => ids.target(lead)),
        })),
      ),
    );
  }

  /** По узлам сторис графа (модуль — `parent`) и рёбрам `leads`. */
  static ofGraph(reader: UiGraphReader): UiSections {
    return new UiSections(reader.sectionStories());
  }

  /** Модуль — раздел: есть сторис, в которую не ведёт связь в счёте. */
  section(module: string): boolean {
    const led = new Set(this.linksInto(module).map((link) => link.to));
    return this.stories.some(
      (story) => story.module === module && !led.has(story.id),
    );
  }

  /** Модули, из которых ведут связи в счёте, без повторов, в порядке графа. */
  sources(module: string): readonly string[] {
    const from = new Set(this.linksInto(module).map((link) => link.from));
    return [...from].sort(GraphId.compare);
  }

  /** Связи в счёте в сторис модуля. */
  private linksInto(module: string): SectionLink[] {
    return this.stories
      .filter((source) => source.module !== module)
      .filter((source) => !this.roots.has(source.id))
      .flatMap((source) =>
        source.leads
          .filter((lead) => this.byId.get(lead)?.module === module)
          .map((to) => ({ from: source.module, to })),
      );
  }
}
