import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_PROVIDER } from '../ui-kinds';
import type { TextItem } from './filled-texts.types';

/**
 * UI-13: тексты заполнены. Узлы поставщика `dmg-ui` и элементы их `props`
 * (исходы, выходы, локальные действия, подтверждения, входы): пустая строка
 * или `TODO` в начале — нарушение.
 */
export class FilledTextsRule implements GraphRule {
  readonly id = 'UI-13';

  private static readonly UNFILLED = /^\s*(?:TODO(?![\p{L}\p{N}_])|$)/u;

  check(graph: Graph): readonly string[] {
    const items = this.itemsByNode(new UiGraphReader(graph));
    const found: string[] = [];
    for (const node of graph.nodes()) {
      if (node.provider !== UI_PROVIDER) continue;
      const own: TextItem[] = [
        { what: 'узла', texts: node },
        ...(items.get(node.id) ?? []),
      ];
      for (const { what, texts } of own) {
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

  /** Элементы `props` с собственными текстами, по `id` узла; разбор — один раз. */
  private itemsByNode(reader: UiGraphReader): Map<string, TextItem[]> {
    const byNode = new Map<string, TextItem[]>();
    for (const { node, props } of reader.stories()) {
      byNode.set(
        node.id,
        props.outcomes.map((o) => ({ what: `исхода ${o.name}`, texts: o })),
      );
    }
    for (const { node, props } of reader.screens()) {
      byNode.set(node.id, [
        ...props.exits.map((e) => ({ what: `выхода ${e.name}`, texts: e })),
        ...props.locals.map((l) => ({
          what: `локального действия ${l.name}`,
          texts: l,
        })),
      ]);
    }
    for (const { node, props } of reader.actions()) {
      byNode.set(
        node.id,
        props.confirm ? [{ what: 'подтверждения', texts: props.confirm }] : [],
      );
    }
    for (const { node, props } of reader.apps()) {
      byNode.set(
        node.id,
        props.entries.map((e) => ({ what: `входа ${e.name}`, texts: e })),
      );
    }
    return byNode;
  }
}
