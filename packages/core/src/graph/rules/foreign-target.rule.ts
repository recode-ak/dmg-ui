import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS, UI_NODE_KINDS } from '../ui-kinds';

/**
 * UI-36: цель-адрес исхода сторис и ссылка уведомления ведут в чужой модуль
 * только на `start` его сторис. Переход действия держат UI-03 и UI-35, вход
 * приложения не ограничен. Цель вне набора пропускается: её называет UI-22.
 */
export class ForeignTargetRule implements GraphRule {
  readonly id = 'UI-36';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node, props } of reader.stories()) {
      for (const outcome of props.outcomes) {
        if (typeof outcome.after === 'string') continue;
        const module = this.foreign(reader, node.id, outcome.after.screen);
        if (module === undefined) continue;
        found.push(
          `сторис ${node.id} направляет исход ${outcome.name} на ${outcome.after.screen} модуля ${module}: в чужой модуль — только start его сторис`,
        );
      }
    }
    for (const node of reader.nodes(UI_NODE_KINDS.notification)) {
      for (const target of reader.targets(node.id, UI_EDGE_KINDS.links)) {
        const module = this.foreign(reader, node.id, target);
        if (module === undefined) continue;
        found.push(
          `уведомление ${node.id}: ссылка на ${target} модуля ${module} — в чужой модуль только start его сторис`,
        );
      }
    }
    return found;
  }

  /** Модуль цели, если он чужой для источника и цель — не `start` его сторис. */
  private foreign(
    reader: UiGraphReader,
    from: string,
    target: string,
  ): string | undefined {
    const own = reader.moduleOf(from);
    const module = reader.moduleOf(target);
    if (own === undefined || module === undefined || module === own) {
      return undefined;
    }
    return reader.moduleStarts(module).has(target) ? undefined : module;
  }
}
