import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_NODE_KINDS } from '../ui-kinds';
import { UiSections } from '../ui-sections';

/**
 * UI-37: во вспомогательный модуль ведут не меньше двух модулей, иначе его
 * сторис — у единственного пользователя. Раздел и источники считает
 * `UiSections` по графу: связи из корневых сторис набора не в счёт.
 */
export class AuxiliaryModuleRule implements GraphRule {
  readonly id = 'UI-37';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const sections = UiSections.ofGraph(reader);
    const found: string[] = [];
    for (const node of reader.nodes(UI_NODE_KINDS.module)) {
      if (sections.section(node.id)) continue;
      const [source, ...more] = sections.sources(node.id);
      if (more.length > 0) continue;
      found.push(
        source === undefined
          ? `модуль ${node.id}: вспомогательный, в него не ведёт ни один модуль`
          : `модуль ${node.id}: вспомогательный, в него ведёт только ${source} — сторис у единственного пользователя`,
      );
    }
    return found;
  }
}
