import type { Graph, GraphRule } from 'dmg-core/graph';
import { UiGraphReader } from '../ui-graph-reader';
import { UI_EDGE_KINDS } from '../ui-kinds';

/**
 * UI-07: каждый экран приложения UI достижим от входов. Семена — цели `entry`
 * и ссылки его уведомлений; дальше замыкание по переходам действий и по
 * целям-адресам исходов (`redirects`) сторис приложения с достигнутым экраном.
 */
export class UnreachableScreenRule implements GraphRule {
  readonly id = 'UI-07';

  check(graph: Graph): readonly string[] {
    const reader = new UiGraphReader(graph);
    const found: string[] = [];
    for (const { node: app } of reader.apps()) {
      const reached = this.reached(reader, app.id);
      const unreached = new Set(
        [...reader.appScreens(app.id)].filter((id) => !reached.has(id)),
      );
      for (const screen of reader.inGraphOrder(unreached)) {
        found.push(
          `приложение ${app.id}: экран ${screen.id} недостижим от входов`,
        );
      }
    }
    return found;
  }

  private reached(reader: UiGraphReader, appId: string): Set<string> {
    const seen = new Set<string>();
    const stories = new Set(reader.appStories(appId));
    const queue = [
      ...reader.targets(appId, UI_EDGE_KINDS.entry),
      ...reader
        .appNotifications(appId)
        .flatMap((id) => reader.targets(id, UI_EDGE_KINDS.links)),
    ];
    for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
      if (seen.has(id)) continue;
      seen.add(id);
      for (const action of reader.actionsOf(id)) {
        queue.push(...reader.targets(action.node.id, UI_EDGE_KINDS.leadsTo));
      }
      for (const story of reader.storiesOf(id)) {
        if (!stories.has(story)) continue;
        queue.push(...reader.targets(story, UI_EDGE_KINDS.redirects));
      }
    }
    return seen;
  }
}
