import type { Graph, GraphRule } from 'dmg-core/graph';
import * as v from 'valibot';
import { UiIds } from '../../address/ui-ids';
import type { AnyUiSetDef } from '../../manifest/ui-set-def.types';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_NODE_KINDS } from '../ui-kinds';
import type { ExampleSample } from './examples-by-schema.types';

/**
 * UI-20: примеры проходят схемы своего экрана или уведомления. Единственное
 * правило по Def, а не по графу: схемы valibot в `props` не попадают (там
 * JSON Schema). `UiIds` строится внутри `check`, когда граф уже собран.
 */
export class ExamplesBySchemaRule implements GraphRule {
  readonly id = 'UI-20';

  constructor(private readonly set: AnyUiSetDef) {}

  check(graph: Graph): readonly string[] {
    const samples = this.samples();
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const node of reader.nodes(
      UI_NODE_KINDS.screen,
      UI_NODE_KINDS.notification,
    )) {
      for (const sample of samples.get(node.id) ?? []) {
        for (const { schema, def, value } of sample.parts) {
          if (!def) continue;
          const result = v.safeParse(def, value);
          if (result.success) continue;
          found.push(
            `${node.id}: пример ${sample.name} не по схеме ${schema}: ${result.issues[0].message}`,
          );
        }
      }
    }
    return found;
  }

  /** Примеры экранов и уведомлений набора по `id` узла. */
  private samples(): Map<string, ExampleSample[]> {
    const ids = new UiIds(this.set);
    const found = new Map<string, ExampleSample[]>();
    for (const module of this.set.modules) {
      for (const screen of module.screens) {
        found.set(
          ids.screen(screen),
          Object.entries(screen.examples).map(([name, example]) => ({
            name,
            parts: [
              { schema: 'params', def: screen.params, value: example.params },
              { schema: 'data', def: screen.data, value: example.data },
              { schema: 'state', def: screen.state, value: example.state },
            ],
          })),
        );
      }
      for (const notification of module.notifications ?? []) {
        found.set(
          ids.notification(notification),
          Object.entries(notification.examples).map(([name, example]) => ({
            name,
            parts: [
              { schema: 'data', def: notification.data, value: example.data },
            ],
          })),
        );
      }
    }
    return found;
  }
}
