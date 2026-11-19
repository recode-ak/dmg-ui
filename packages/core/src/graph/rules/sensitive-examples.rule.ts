import type { Graph, GraphRule } from 'dmg-core/graph';
import { JsonSchemaView } from '../json-schema-view';
import { UiGraphReader } from '../ui-graph-reader';

/**
 * UI-26: у поля с `F.sensitive` нет `examples` в схемах `params`, `state`,
 * `input` действий и локальных действий, данных выходов: пример виден в
 * графе. `hint` у чувствительного поля допустим.
 */
export class SensitiveExamplesRule implements GraphRule {
  readonly id = 'UI-26';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    const add = (id: string, name: string, schema: Record<string, unknown>) => {
      for (const path of new JsonSchemaView(schema).sensitiveWithExamples()) {
        found.push(
          `${id}: у поля ${path} схемы ${name} с F.sensitive есть examples`,
        );
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
