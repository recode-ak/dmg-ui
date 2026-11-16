import type { Graph, GraphRule } from 'dmg-core/graph';
import { JsonSchemaView } from '../json-schema-view';
import { UiGraphReader } from '../ui-graph-reader';

/** UI-19: `params` и `state` экрана — строгие объекты, `input` действия — объект. */
export class StrictParamsRule implements GraphRule {
  readonly id = 'UI-19';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const screens = new Map(reader.screens().map((s) => [s.node.id, s.props]));
    const actions = new Map(reader.actions().map((a) => [a.node.id, a.props]));
    const found: string[] = [];
    for (const node of graph.nodes()) {
      const screen = screens.get(node.id);
      if (screen) {
        const named = { params: screen.params, state: screen.state };
        for (const [name, schema] of Object.entries(named)) {
          if (schema && !new JsonSchemaView(schema).isStrict()) {
            found.push(
              `экран ${node.id}: схема ${name} не строгая (strictObject)`,
            );
          }
        }
      }
      const input = actions.get(node.id)?.input;
      if (input && !new JsonSchemaView(input).isObject()) {
        found.push(`действие ${node.id}: схема input не объект`);
      }
    }
    return found;
  }
}
