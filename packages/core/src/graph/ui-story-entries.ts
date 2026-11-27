import { DomainIds, GraphId } from 'dmg-core/graph';
import { Address } from '../address/address';
import type { UiIds } from '../address/ui-ids';
import type { ScreenAction } from '../manifest/screen-action';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyStoryDef, OutcomeSpec } from '../manifest/story-def.types';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { UiStartsFromProps } from './ui-props.types';
import type { UiStoryIncoming } from './ui-story-entries.types';

/** Порядок видов входа в `startsFrom`. */
const VIA_ORDER: Readonly<Record<UiStartsFromProps['via'], number>> = {
  entry: 0,
  notification: 1,
  action: 2,
  redirect: 3,
};

/**
 * Входы сторис (`startsFrom`) по Def набора и приложений UI, а не по рёбрам
 * графа: вход — переход снаружи на любой экран сторис. Переходы индексируются
 * по экрану-цели один раз, в конструкторе.
 */
export class UiStoryEntries {
  private readonly incoming = new Map<AnyScreenDef, UiStoryIncoming[]>();
  private readonly known: ReadonlySet<AnyScreenDef>;

  constructor(
    set: AnyUiSetDef,
    apps: readonly AnyUiAppDef[],
    private readonly ids: UiIds,
  ) {
    const domain = new DomainIds(set.app);
    this.known = new Set(set.modules.flatMap((module) => module.screens));
    for (const app of apps) this.indexApp(app);
    for (const module of set.modules) {
      for (const notification of module.notifications ?? []) {
        const from = ids.notification(notification);
        const event = domain.event(notification.event);
        for (const target of notification.links()) {
          const screen = ids.target(target);
          this.put(target, {
            record: { via: 'notification', from, screen, event },
          });
        }
      }
      for (const screen of module.screens) this.indexActions(screen);
      for (const story of module.stories) this.indexOutcomes(story);
    }
  }

  /**
   * Входы сторис без повторов: по виду (`entry`, `notification`, `action`,
   * `redirect`), затем по источнику и экрану (`GraphId.compare`), затем по
   * имени входа; от порядка Def не зависит. Каждый вызов — новый массив.
   */
  of(story: AnyStoryDef): UiStartsFromProps[] {
    const found = new Map<string, UiStartsFromProps>();
    for (const screen of story.screens) {
      for (const candidate of this.incoming.get(screen) ?? []) {
        if (candidate.owner && story.screens.includes(candidate.owner)) {
          continue;
        }
        found.set(UiStoryEntries.key(candidate.record), candidate.record);
      }
    }
    return [...found.values()].sort(UiStoryEntries.compare);
  }

  private indexApp(app: AnyUiAppDef): void {
    const from = this.ids.app(app);
    for (const [name, entry] of Object.entries(app.entries)) {
      const target = entry.address.screen;
      const screen = this.ids.target(target);
      this.put(target, { record: { via: 'entry', from, screen, name } });
    }
  }

  private indexActions(owner: AnyScreenDef): void {
    for (const action of Object.values<ScreenAction>(owner.actions)) {
      const from = this.ids.action(owner, action.name);
      for (const target of action.targets()) {
        const screen = this.ids.target(target);
        this.put(target, { record: { via: 'action', from, screen }, owner });
      }
    }
  }

  /** Исход в свой экран — не переход наружу: в индекс не попадает. */
  private indexOutcomes(source: AnyStoryDef): void {
    const from = this.ids.story(source);
    for (const outcome of Object.values<OutcomeSpec>(source.outcomes)) {
      if (!(outcome.after instanceof Address)) continue;
      const target = outcome.after.screen;
      if (source.screens.includes(target)) continue;
      const screen = this.ids.target(target);
      this.put(target, { record: { via: 'redirect', from, screen } });
    }
  }

  /** Экран вне набора не индексируется: вход в `orphan` не ведёт (UI-22). */
  private put(target: AnyScreenDef, candidate: UiStoryIncoming): void {
    if (!this.known.has(target)) return;
    const list = this.incoming.get(target) ?? [];
    list.push(candidate);
    this.incoming.set(target, list);
  }

  private static key(record: UiStartsFromProps): string {
    const name = record.via === 'entry' ? record.name : '';
    return `${record.via} ${record.from} ${record.screen} ${name}`;
  }

  private static compare(a: UiStartsFromProps, b: UiStartsFromProps): number {
    return (
      VIA_ORDER[a.via] - VIA_ORDER[b.via] ||
      GraphId.compare(a.from, b.from) ||
      GraphId.compare(a.screen, b.screen) ||
      UiStoryEntries.compareNames(a, b)
    );
  }

  /** Имя входа — в кодовых единицах, как `GraphId.compare`, а не по локали. */
  private static compareNames(
    a: UiStartsFromProps,
    b: UiStartsFromProps,
  ): number {
    const left = a.via === 'entry' ? a.name : '';
    const right = b.via === 'entry' ? b.name : '';
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }
}
