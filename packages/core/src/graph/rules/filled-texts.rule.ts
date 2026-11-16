import type { Graph, GraphNode, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_NODE_KINDS, UI_PROVIDER } from '../ui-kinds';
import type { UiItemProps } from '../ui-props.types';

/** Подпись элемента `props` для текста нарушения: `у исхода finished`. */
type Item = { readonly what: string; readonly texts: UiItemProps };

/**
 * UI-13: тексты заполнены. Узлы поставщика `dmg-ui` и элементы их `props`
 * (исходы, выходы, локальные действия, подтверждения, входы): пустая строка
 * или `TODO` в начале — нарушение.
 */
export class FilledTextsRule implements GraphRule {
  readonly id = 'UI-13';

  private static readonly UNFILLED = /^\s*(?:TODO(?![\p{L}\p{N}_])|$)/u;

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const node of graph.nodes()) {
      if (node.provider !== UI_PROVIDER) continue;
      const items: Item[] = [
        { what: 'узла', texts: node },
        ...this.itemsOf(reader, node),
      ];
      for (const { what, texts } of items) {
        for (const field of ['label', 'description'] as const) {
          if (FilledTextsRule.UNFILLED.test(texts[field])) {
            found.push(
              `${node.id}: пустой или не заполненный (TODO) ${field} у ${what}`,
            );
          }
        }
      }
    }
    return found;
  }

  /** Элементы `props` узла, у которых есть свои тексты. */
  private itemsOf(reader: UiGraphReader, node: GraphNode): Item[] {
    switch (node.kind) {
      case UI_NODE_KINDS.story:
        return reader
          .stories()
          .filter((s) => s.node.id === node.id)
          .flatMap((s) =>
            s.props.outcomes.map((o) => ({
              what: `исхода ${o.name}`,
              texts: o,
            })),
          );
      case UI_NODE_KINDS.screen:
        return reader
          .screens()
          .filter((s) => s.node.id === node.id)
          .flatMap((s) => [
            ...s.props.exits.map((e) => ({
              what: `выхода ${e.name}`,
              texts: e,
            })),
            ...s.props.locals.map((l) => ({
              what: `локального действия ${l.name}`,
              texts: l,
            })),
          ]);
      case UI_NODE_KINDS.action:
        return reader
          .actions()
          .filter((a) => a.node.id === node.id)
          .flatMap((a) =>
            a.props.confirm
              ? [{ what: 'подтверждения', texts: a.props.confirm }]
              : [],
          );
      case UI_NODE_KINDS.app:
        return reader
          .apps()
          .filter((a) => a.node.id === node.id)
          .flatMap((a) =>
            a.props.entries.map((e) => ({ what: `входа ${e.name}`, texts: e })),
          );
      default:
        return [];
    }
  }
}
