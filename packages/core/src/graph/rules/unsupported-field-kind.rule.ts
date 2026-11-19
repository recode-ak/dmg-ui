import type { Graph, GraphRule } from 'dmg-core/graph';
import { JsonSchemaView } from '../json-schema-view';
import { UiGraphReader } from '../ui-graph-reader';

/**
 * UI-27: поле первого уровня схемы `input` действия и локального действия —
 * не `array` и не `object`: такого ввода у человека нет, откат на строку
 * молчит и порождает вопрос, на который схема не примет ответ.
 */
export class UnsupportedFieldKindRule implements GraphRule {
  readonly id = 'UI-27';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    const add = (id: string, name: string, schema: Record<string, unknown>) => {
      for (const field of new JsonSchemaView(schema).unsupportedFields()) {
        found.push(
          `${id}: поле ${field.name} схемы ${name} имеет вид ${field.kind}, которого нет у ввода человека (string, number, boolean, date, choice)`,
        );
      }
    };
    const screens = new Map(reader.screens().map((s) => [s.node.id, s]));
    const actions = new Map(reader.actions().map((a) => [a.node.id, a]));
    for (const node of graph.nodes()) {
      const screen = screens.get(node.id);
      if (screen) {
        for (const local of screen.props.locals) {
          if (local.input)
            add(node.id, `local.${local.name}.input`, local.input);
        }
      }
      const input = actions.get(node.id)?.props.input;
      if (input) add(node.id, 'input', input);
    }
    return found;
  }
}
