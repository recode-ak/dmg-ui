import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS, UI_NODE_KINDS } from '../ui-kinds';

/**
 * UI-05: переход и вход приложения UI ведут на экран из его сторис. Пара
 * (экран, цель) называется один раз; цель входа — только если перехода на
 * неё нет.
 */
export class TransitionOutsideAppRule implements GraphRule {
  readonly id = 'UI-05';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node: app } of reader.apps()) {
      const inside = reader.appScreens(app.id);
      const outside = (to: string) =>
        reader.kindOf(to) === UI_NODE_KINDS.screen && !inside.has(to);
      const reported = new Set<string>();
      const named = new Set<string>();
      for (const screen of reader.inGraphOrder(inside)) {
        for (const action of reader.actionsOf(screen.id)) {
          for (const to of reader.targets(
            action.node.id,
            UI_EDGE_KINDS.leadsTo,
          )) {
            if (!outside(to)) continue;
            reported.add(to);
            if (named.has(`${screen.id} ${to}`)) continue;
            named.add(`${screen.id} ${to}`);
            found.push(
              `приложение ${app.id}: экран ${screen.id} ведёт на ${to}, которого нет в его сторис`,
            );
          }
        }
      }
      for (const to of reader.targets(app.id, UI_EDGE_KINDS.entry)) {
        if (!outside(to) || reported.has(to)) continue;
        found.push(
          `приложение ${app.id}: вход ведёт на ${to}, которого нет в его сторис`,
        );
      }
    }
    return found;
  }
}
