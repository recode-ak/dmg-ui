import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';

/** UI-23: форма сторис — `start` и выходы исходов принадлежат её экранам. */
export class StoryFormRule implements GraphRule {
  readonly id = 'UI-23';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node, props } of reader.stories()) {
      const screens = reader.storyScreens(node.id);
      if (!screens.includes(props.start)) {
        found.push(
          `сторис ${node.id}: start ${props.start} не входит в её экраны`,
        );
      }
      for (const outcome of props.outcomes) {
        if (outcome.exits.every((exit) => screens.includes(exit.screen))) {
          continue;
        }
        found.push(
          `сторис ${node.id}: исход ${outcome.name} ссылается на выход экрана вне сторис`,
        );
      }
    }
    return found;
  }
}
