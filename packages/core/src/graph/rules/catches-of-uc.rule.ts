import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/** UI-15: ошибка из `catches` экрана объявлена (`failsWith`) хотя бы у одного его UC. */
export class CatchesOfUcRule implements GraphRule {
  readonly id = 'UI-15';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node } of reader.screens()) {
      const declared = new Set(
        reader.ucsOf(node.id).flatMap((uc) => reader.targets(uc, 'failsWith')),
      );
      for (const error of reader.targets(node.id, UI_EDGE_KINDS.catches)) {
        if (declared.has(error)) continue;
        found.push(
          `экран ${node.id} перехватывает ${error}, которой нет у его UC`,
        );
      }
    }
    return found;
  }
}
