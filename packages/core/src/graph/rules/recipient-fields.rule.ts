import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/** UI-18: получатели уведомления — непустой список полей payload его события. */
export class RecipientFieldsRule implements GraphRule {
  readonly id = 'UI-18';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node, props } of reader.notifications()) {
      const { from, fields } = props.recipients;
      if (from !== 'payload') continue;
      const head = `уведомление ${node.id}`;
      if (fields.length === 0) {
        found.push(`${head}: список получателей пуст`);
      }
      for (const event of reader.targets(node.id, UI_EDGE_KINDS.notifiedBy)) {
        const payload = reader.payloadFields(event);
        for (const field of fields) {
          if (payload && !payload.has(field)) {
            found.push(`${head}: поля ${field} нет в payload события ${event}`);
          }
        }
      }
    }
    return found;
  }
}
