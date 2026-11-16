import type { Graph, GraphRule } from 'dmg-core/graph';
import { FAILS_WITH_KIND } from '../ui-domain-props';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/** UI-15: ошибка из `catches` экрана объявлена (`failsWith`) хотя бы у одного его UC. */
export class CatchesOfUcRule implements GraphRule {
  readonly id = 'UI-15';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const external = new Set(graph.externals());
    const found: string[] = [];
    for (const { node } of reader.screens()) {
      const declared = new Set(
        reader
          .ucsOf(node.id)
          .flatMap((uc) => reader.targets(uc, FAILS_WITH_KIND)),
      );
      for (const error of reader.targets(node.id, UI_EDGE_KINDS.catches)) {
        // Внешний конец — узла ошибки в графе нет: базовая ошибка ядра есть у
        // любого UC, а ошибку вне домена ловит UI-22.
        if (declared.has(error) || external.has(error)) continue;
        found.push(
          `экран ${node.id} перехватывает ${error}, которой нет у его UC`,
        );
      }
    }
    return found;
  }
}
