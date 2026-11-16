import type { Graph, GraphRule } from 'dmg-core/graph';
import { JsonSchemaView } from '../json-schema-view';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/**
 * UI-17: запись `refresh` согласована с экраном и событием: ключ `params` —
 * параметр экрана, значение и `subject` — поля payload, запись не пуста.
 */
export class RefreshRecordRule implements GraphRule {
  readonly id = 'UI-17';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node, props } of reader.screens()) {
      const own = new JsonSchemaView(props.params).fields();
      for (const event of reader.targets(node.id, UI_EDGE_KINDS.refreshedBy)) {
        const payload = reader.payloadFields(event);
        const head = `экран ${node.id}: запись refresh события ${event}`;
        const records = reader.refreshRecords(node.id, event)?.records ?? [];
        for (const record of records) {
          const keys = Object.keys(record.params);
          if (
            keys.length === 0 &&
            record.subject === undefined &&
            !record.any
          ) {
            found.push(`${head}: запись без params, subject и any`);
          }
          for (const key of keys) {
            if (!own.includes(key)) {
              found.push(`${head}: ключ ${key} не параметр экрана`);
            }
          }
          const fields = [
            ...Object.values(record.params),
            ...(record.subject === undefined ? [] : [record.subject]),
          ];
          for (const field of fields) {
            if (payload && !payload.has(field)) {
              found.push(
                `${head}: поля ${field} нет в payload события ${event}`,
              );
            }
          }
        }
      }
    }
    return found;
  }
}
