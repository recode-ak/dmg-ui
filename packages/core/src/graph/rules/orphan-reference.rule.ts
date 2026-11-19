import type { Graph, GraphEdge, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS, UI_PROVIDER } from '../ui-kinds';

/**
 * UI-22: ссылки узлов `dmg-ui` — только на Def набора UI и домена. Ссылка на
 * Def вне них — внешний конец под `dmg-ui/orphan/` или `dmg-core/orphan/`.
 * Правило сторис (`requires`) во внешнем конце вне них — правило домена,
 * которое не проверяет ни один UC: узла у него нет. Цель-адрес исхода
 * (`redirects`) вне набора называется по исходу сторис.
 */
export class OrphanReferenceRule implements GraphRule {
  readonly id = 'UI-22';

  private static readonly ROOTS = [
    `${UI_PROVIDER}/orphan/`,
    'dmg-core/orphan/',
  ];

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const external = new Set(graph.externals());
    const found = new Set<string>();
    for (const edge of graph.edges()) {
      if (!external.has(edge.to) || edge.provider !== UI_PROVIDER) continue;
      for (const line of OrphanReferenceRule.linesOf(edge, reader)) {
        found.add(line);
      }
    }
    return [...found];
  }

  /** Тексты нарушения ребра во внешний конец; ссылка в пределах набора и домена — пусто. */
  private static linesOf(edge: GraphEdge, reader: UiGraphReader): string[] {
    const root = OrphanReferenceRule.ROOTS.find((r) => edge.to.startsWith(r));
    if (root !== undefined) {
      const [dmg, ...name] = edge.to.slice(root.length).split('/');
      if (edge.kind === UI_EDGE_KINDS.redirects) {
        return OrphanReferenceRule.redirects(edge, name.join('/'), reader);
      }
      return [
        `${edge.from} ссылается на ${dmg} «${name.join('/')}» вне набора UI и домена`,
      ];
    }
    if (edge.kind !== UI_EDGE_KINDS.requires) return [];
    const rule = edge.to.split('/').at(-1);
    return [
      `сторис ${edge.from} требует правило «${rule}», которого нет в графе: его не проверяет ни один UC`,
    ];
  }

  /** Исходы сторис, чья цель — экран `name` вне набора. */
  private static redirects(
    edge: GraphEdge,
    name: string,
    reader: UiGraphReader,
  ): string[] {
    return reader
      .outcomesOf(edge.from)
      .filter(
        ({ after }) => typeof after === 'object' && after.screen === edge.to,
      )
      .map(
        (outcome) =>
          `сторис ${edge.from} направляет исход ${outcome.name} на экран «${name}», которого нет в наборе`,
      );
  }
}
