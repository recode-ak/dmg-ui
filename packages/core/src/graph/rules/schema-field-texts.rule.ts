import type { Graph, GraphRule } from 'dmg-core/graph';
import { JsonSchemaView } from '../json-schema-view';
import { UiGraphReader } from '../ui-graph-reader';

/**
 * UI-14: у каждого поля схем `params`, `state`, `input` действий и локальных
 * действий, данных выходов есть `description`. Данные загрузки не проверяются:
 * они выводятся из UC.
 */
export class SchemaFieldTextsRule implements GraphRule {
  readonly id = 'UI-14';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    const add = (id: string, name: string, schema: Record<string, unknown>) => {
      for (const path of new JsonSchemaView(schema).undescribed()) {
        found.push(`${id}: поле ${path} схемы ${name} без description`);
      }
    };
    const screens = new Map(reader.screens().map((s) => [s.node.id, s]));
    const actions = new Map(reader.actions().map((a) => [a.node.id, a]));
    for (const node of graph.nodes()) {
      const screen = screens.get(node.id);
      if (screen) {
        const { params, state, locals, exits } = screen.props;
        add(node.id, 'params', params);
        if (state) add(node.id, 'state', state);
        for (const local of locals) {
          if (local.input)
            add(node.id, `local.${local.name}.input`, local.input);
        }
        for (const exit of exits) {
          if (exit.data) add(node.id, `exit.${exit.name}.data`, exit.data);
        }
      }
      const input = actions.get(node.id)?.props.input;
      if (input) add(node.id, 'input', input);
    }
    return found;
  }
}
