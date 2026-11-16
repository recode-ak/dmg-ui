import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';

/** UI-02: экран входит хотя бы в одну сторис. */
export class ScreenWithoutStoryRule implements GraphRule {
  readonly id = 'UI-02';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    return reader
      .screens()
      .filter(({ node }) => reader.storiesOf(node.id).length === 0)
      .map(({ node }) => `экран ${node.id} не входит ни в одну сторис`);
  }
}
