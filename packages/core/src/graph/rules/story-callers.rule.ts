import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';

/** UI-01: вызывающие сторис допущены к каждому UC её экранов. */
export class StoryCallersRule implements GraphRule {
  readonly id = 'UI-01';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node, props } of reader.stories()) {
      for (const screen of reader.storyScreens(node.id)) {
        for (const ucId of reader.ucsOf(screen)) {
          const allowed = reader.uc(ucId)?.callers;
          if (!allowed) continue;
          for (const caller of props.callers) {
            if (allowed.includes(caller)) continue;
            found.push(
              `сторис ${node.id}: вызывающий «${caller}» не допущен к UC ${ucId} экрана ${screen}`,
            );
          }
        }
      }
    }
    return found;
  }
}
