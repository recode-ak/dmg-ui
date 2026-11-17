import type { Graph, GraphNode } from 'dmg-core/graph';
import { CHAT_NODE_KINDS } from 'dmg-ui/chat-ui';
import { UI_NODE_KINDS } from 'dmg-ui/graph';
import * as v from 'valibot';
import { TELEGRAM_CAPABILITIES } from '../messenger/telegram.const';
import {
  ENTRY_PROPS,
  MESSENGER_NAME_PROPS,
  POINT_PROPS,
} from './telegram-graph.const';
import type { TelegramApp, TelegramPoint } from './telegram-graph.types';

/**
 * Область правил TG (D-UI-64): приложения UI, у которых прямо под узлом лежит
 * `chatMessenger` с именем `telegram`; приложения других мессенджеров правила
 * не видят. Читает только узлы и рёбра графа, свойства не по схеме
 * пропускает молча; не бросает.
 */
export class TelegramApps {
  constructor(private readonly graph: Graph) {}

  /** Приложения Telegram графа по порядку узлов. */
  list(): readonly TelegramApp[] {
    const { graph } = this;
    return graph
      .nodes()
      .filter((node) => node.kind === UI_NODE_KINDS.app)
      .flatMap((app) => {
        const children = graph.children(app.id);
        if (!TelegramApps.telegram(children)) return [];
        return [
          {
            id: app.id,
            entries: TelegramApps.entries(children),
            points: TelegramApps.points(children),
          },
        ];
      });
  }

  private static telegram(children: readonly GraphNode[]): boolean {
    return children.some((node) => {
      if (node.kind !== CHAT_NODE_KINDS.messenger) return false;
      const props = v.safeParse(MESSENGER_NAME_PROPS, node.props);
      return props.success && props.output.name === TELEGRAM_CAPABILITIES.name;
    });
  }

  /** Входы приложения: имя из свойств и название — `label` узла. */
  private static entries(
    children: readonly GraphNode[],
  ): ReadonlyMap<string, string> {
    const entries = new Map<string, string>();
    for (const node of children) {
      if (node.kind !== CHAT_NODE_KINDS.entry) continue;
      const props = v.safeParse(ENTRY_PROPS, node.props);
      if (props.success) entries.set(props.output.entry, node.label);
    }
    return entries;
  }

  private static points(
    children: readonly GraphNode[],
  ): readonly TelegramPoint[] {
    return children.flatMap((node) => {
      if (node.kind !== CHAT_NODE_KINDS.point) return [];
      const props = v.safeParse(POINT_PROPS, node.props);
      return props.success ? [{ id: node.id, ...props.output }] : [];
    });
  }
}
