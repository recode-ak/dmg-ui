import type { Graph, GraphRule } from 'dmg-core/graph';
import { UC_KIND } from '../ui-domain-props';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/** UI-11: UC, предназначенный человеку (`visible`), вызывает хотя бы один экран. */
export class VisibleWithoutScreenRule implements GraphRule {
  readonly id = 'UI-11';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    return reader
      .nodes(UC_KIND)
      .filter(
        (node) =>
          node.visible &&
          reader.sources(node.id, UI_EDGE_KINDS.reads).length === 0 &&
          reader.sources(node.id, UI_EDGE_KINDS.invokes).length === 0,
      )
      .map(
        (node) =>
          `UC ${node.id} предназначен человеку (visible), но ни один экран его не вызывает`,
      );
  }
}
