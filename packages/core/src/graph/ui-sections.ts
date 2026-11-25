import { GraphId } from 'dmg-core/graph';
import type { UiIds } from '../address/ui-ids';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { UiGraphReader } from './ui-graph-reader';
import type { SectionStory } from './ui-sections.types';

/**
 * Раздел и вспомогательный модуль набора по связям сторис (D-UI-119).
 * Корневая сторис — без входящих связей набора; её связи не в счёт (меню).
 * Раздел — есть сторис, в которую ведут только корневые или никто; иначе
 * вспомогательный. Источники — модули не корневых сторис со связью в модуль.
 * Один алгоритм на два входа: Def набора (`ofSet`) и граф (`ofGraph`, UI-37).
 */
export class UiSections {
  private readonly byId: ReadonlyMap<string, SectionStory>;
  private readonly roots: ReadonlySet<string>;
  private readonly entered: ReadonlySet<string>;

  private constructor(private readonly stories: readonly SectionStory[]) {
    this.byId = new Map(stories.map((story) => [story.id, story]));
    const led = new Set(stories.flatMap((story) => story.leads));
    this.roots = new Set(
      stories.filter((story) => !led.has(story.id)).map((story) => story.id),
    );
    this.entered = new Set(this.inner().flatMap((story) => story.leads));
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

  /** Модуль — раздел: есть сторис, в которую не ведёт ни одна не корневая. */
  section(module: string): boolean {
    return this.stories.some(
      (story) => story.module === module && !this.entered.has(story.id),
    );
  }

  /** Модули не корневых сторис со связью в модуль, без своего, в порядке графа. */
  sources(module: string): readonly string[] {
    const from = this.inner()
      .filter((source) => source.module !== module)
      .filter((source) =>
        source.leads.some((lead) => this.byId.get(lead)?.module === module),
      )
      .map((source) => source.module);
    return [...new Set(from)].sort(GraphId.compare);
  }

  /** Не корневые сторис набора — их связи в счёте. */
  private inner(): SectionStory[] {
    return this.stories.filter((story) => !this.roots.has(story.id));
  }
}
