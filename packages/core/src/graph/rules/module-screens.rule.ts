import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_NODE_KINDS } from '../ui-kinds';

/**
 * UI-35: сторис включает только экраны своего модуля. Экран вне набора
 * пропускается: модуля у него нет, ссылку называет UI-22.
 */
export class ModuleScreensRule implements GraphRule {
  readonly id = 'UI-35';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const node of reader.nodes(UI_NODE_KINDS.story)) {
      const own = reader.moduleOf(node.id);
      if (own === undefined) continue;
      for (const screen of reader.storyScreens(node.id)) {
        const module = reader.moduleOf(screen);
        if (module === undefined || module === own) continue;
        found.push(
          `сторис ${node.id}: экран ${screen} из модуля ${module} — сторис включает только экраны своего модуля`,
        );
      }
    }
    return found;
  }
}
