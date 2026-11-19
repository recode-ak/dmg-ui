import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';

/** Выход экрана и исходы сторис приложения, которые на него ссылаются. */
type BoundExit = {
  readonly screen: string;
  readonly exit: string;
  readonly stories: string[];
  readonly afters: Set<string>;
};

/**
 * UI-25: выход экрана ведёт к одной цели во всех сторис приложения UI. Канал
 * не знает, какая из сторис с общим экраном «идёт», поэтому исходы разных
 * сторис по одному выходу обязаны совпадать целью. Цели сравниваются по
 * свойству `after` исхода как JSON; сторис вне приложения не в счёт.
 */
export class ExitTargetsRule implements GraphRule {
  readonly id = 'UI-25';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node: app } of reader.apps()) {
      const bound = new Map<string, BoundExit>();
      const stories = new Set(reader.appStories(app.id));
      for (const story of reader.inGraphOrder(stories)) {
        for (const outcome of reader.outcomesOf(story.id)) {
          const after = JSON.stringify(outcome.after);
          for (const { screen, exit } of outcome.exits) {
            const key = `${screen} ${exit}`;
            const entry = bound.get(key) ?? {
              screen,
              exit,
              stories: [],
              afters: new Set<string>(),
            };
            if (!entry.stories.includes(story.id)) entry.stories.push(story.id);
            entry.afters.add(after);
            bound.set(key, entry);
          }
        }
      }
      for (const { screen, exit, stories: names, afters } of bound.values()) {
        if (afters.size < 2) continue;
        found.push(
          `приложение ${app.id}: выход ${exit} экрана ${screen} привязан к исходам сторис ${names.join(', ')} с разными целями`,
        );
      }
    }
    return found;
  }
}
