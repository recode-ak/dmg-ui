import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';

/** UI-21: имена действий и локальных действий экрана не пересекаются. */
export class LocalActionNamesRule implements GraphRule {
  readonly id = 'UI-21';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node, props } of reader.screens()) {
      const actions = reader.actionNames(node.id);
      for (const local of props.locals) {
        if (!actions.includes(local.name)) continue;
        found.push(
          `экран ${node.id}: имя ${local.name} и у действия, и у локального действия`,
        );
      }
    }
    return found;
  }
}
