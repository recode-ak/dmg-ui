import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_NODE_KINDS } from '../ui-kinds';

/**
 * UI-06: у экрана и уведомления приложения UI есть представление в канале:
 * ребро `presents` от приложения или узла под ним к самому узлу или к набору
 * UI целиком.
 */
export class ScreenWithoutPresentationRule implements GraphRule {
  readonly id = 'UI-06';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node: app, props } of reader.apps()) {
      const presented = reader.presentedBy(app.id);
      if (presented.has(props.set)) continue;
      const members = new Set([
        ...reader.appScreens(app.id),
        ...reader.appNotifications(app.id),
      ]);
      for (const member of reader.inGraphOrder(members)) {
        if (presented.has(member.id)) continue;
        const what =
          member.kind === UI_NODE_KINDS.screen ? 'экрана' : 'уведомления';
        found.push(
          `приложение ${app.id}: у ${what} ${member.id} нет представления в канале`,
        );
      }
    }
    return found;
  }
}
