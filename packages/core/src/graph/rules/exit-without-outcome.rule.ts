import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';

/** UI-04: каждый выход экрана связан с исходом каждой сторис, включающей экран. */
export class ExitWithoutOutcomeRule implements GraphRule {
  readonly id = 'UI-04';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const screens = new Map(reader.screens().map((s) => [s.node.id, s.props]));
    const found: string[] = [];
    for (const { node, props } of reader.stories()) {
      const linked = new Set(
        props.outcomes.flatMap((outcome) =>
          outcome.exits.map((exit) => `${exit.screen}\n${exit.exit}`),
        ),
      );
      for (const screen of reader.storyScreens(node.id)) {
        for (const exit of screens.get(screen)?.exits ?? []) {
          if (linked.has(`${screen}\n${exit.name}`)) continue;
          found.push(
            `выход ${exit.name} экрана ${screen} не связан с исходом сторис ${node.id}`,
          );
        }
      }
    }
    return found;
  }
}
