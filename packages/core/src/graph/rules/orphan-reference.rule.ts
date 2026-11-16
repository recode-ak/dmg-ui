import type { Graph, GraphRule } from 'dmg-core/graph';
import { UI_PROVIDER } from '../ui-kinds';

/**
 * UI-22: ссылки узлов `dmg-ui` — только на Def набора UI и домена. Ссылка на
 * Def вне них — внешний конец под `dmg-ui/orphan/` или `dmg-core/orphan/`.
 */
export class OrphanReferenceRule implements GraphRule {
  readonly id = 'UI-22';

  private static readonly ROOTS = [
    `${UI_PROVIDER}/orphan/`,
    'dmg-core/orphan/',
  ];

  check(graph: Graph): readonly string[] {
    const external = new Set(graph.externals());
    const found = new Set<string>();
    for (const edge of graph.edges()) {
      if (!external.has(edge.to) || edge.provider !== UI_PROVIDER) continue;
      const root = OrphanReferenceRule.ROOTS.find((r) => edge.to.startsWith(r));
      if (root === undefined) continue;
      const [dmg, ...name] = edge.to.slice(root.length).split('/');
      found.add(
        `${edge.from} ссылается на ${dmg} «${name.join('/')}» вне набора UI и домена`,
      );
    }
    return [...found];
  }
}
