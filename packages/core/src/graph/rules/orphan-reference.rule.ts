import type { Graph, GraphEdge, GraphRule } from 'dmg-core/graph';
import { UI_EDGE_KINDS, UI_PROVIDER } from '../ui-kinds';

/**
 * UI-22: ссылки узлов `dmg-ui` — только на Def набора UI и домена. Ссылка на
 * Def вне них — внешний конец под `dmg-ui/orphan/` или `dmg-core/orphan/`.
 * Правило сторис (`requires`) во внешнем конце вне них — правило домена,
 * которое не проверяет ни один UC: узла у него нет.
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
      const line = OrphanReferenceRule.lineOf(edge);
      if (line !== undefined) found.add(line);
    }
    return [...found];
  }

  /** Текст нарушения ребра во внешний конец; ссылка в пределах набора и домена — `undefined`. */
  private static lineOf(edge: GraphEdge): string | undefined {
    const root = OrphanReferenceRule.ROOTS.find((r) => edge.to.startsWith(r));
    if (root !== undefined) {
      const [dmg, ...name] = edge.to.slice(root.length).split('/');
      return `${edge.from} ссылается на ${dmg} «${name.join('/')}» вне набора UI и домена`;
    }
    if (edge.kind !== UI_EDGE_KINDS.requires) return undefined;
    const rule = edge.to.split('/').at(-1);
    return `сторис ${edge.from} требует правило «${rule}», которого нет в графе: его не проверяет ни один UC`;
  }
}
