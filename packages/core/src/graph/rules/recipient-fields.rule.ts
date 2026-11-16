import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/**
 * UI-18: получатели уведомления — непустой список полей. Из payload — поля
 * payload его события; из query UC — UC query с `system` в `callers`, а
 * значения входа UC — поля payload события.
 */
export class RecipientFieldsRule implements GraphRule {
  readonly id = 'UI-18';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node, props } of reader.notifications()) {
      const { recipients } = props;
      const head = `уведомление ${node.id}`;
      if (recipients.fields.length === 0) {
        found.push(`${head}: список получателей пуст`);
      }
      const fromPayload =
        recipients.from === 'payload'
          ? recipients.fields
          : Object.values(recipients.input);
      for (const event of reader.targets(node.id, UI_EDGE_KINDS.notifiedBy)) {
        const payload = reader.payloadFields(event);
        for (const field of fromPayload) {
          if (payload && !payload.has(field)) {
            found.push(`${head}: поля ${field} нет в payload события ${event}`);
          }
        }
      }
      if (recipients.from === 'query') {
        found.push(...this.queryLines(reader, node.id, head));
      }
    }
    return found;
  }

  /** UC получателей: только query и с системным вызывающим. */
  private queryLines(
    reader: UiGraphReader,
    id: string,
    head: string,
  ): string[] {
    const found: string[] = [];
    for (const ucId of reader.targets(id, UI_EDGE_KINDS.recipients)) {
      const uc = reader.uc(ucId);
      if (!uc) continue;
      if (uc.type !== 'query') {
        found.push(`${head}: UC получателей ${ucId} — не query`);
      }
      if (!uc.callers.includes('system')) {
        found.push(`${head}: в callers UC получателей ${ucId} нет system`);
      }
    }
    return found;
  }
}
