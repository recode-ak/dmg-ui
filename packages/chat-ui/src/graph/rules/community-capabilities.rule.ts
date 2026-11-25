import type { Graph, GraphNode, GraphRule } from 'dmg-core/graph';
import { UI_NODE_KINDS } from 'dmg-ui/graph';
import * as v from 'valibot';
import { MessengerCapabilitiesSchema } from '../../messenger/capabilities-schema';
import type { MessengerCapabilities } from '../../messenger/messenger.types';
import { CHAT_NODE_KINDS } from '../chat-kinds';
import { CHAT_REACTION_PROPS, CHAT_SIGNAL_PROPS } from '../chat-props';

/**
 * CH-03 (D-UI-60): сигнал `chatSignal` и реакция `chatReaction` прямо под
 * приложением UI — только если мессенджер приложения (узел `chatMessenger`
 * под ним) принимает этот сигнал или исполняет эту операцию. Свойства не по
 * схеме — молча: свои узлы поставщик ставит только по схеме (бросок
 * конструктора `ChatGraphProvider`); `check` не бросает.
 */
export class CommunityCapabilitiesRule implements GraphRule {
  readonly id = 'CH-03';

  check(graph: Graph): readonly string[] {
    return graph
      .nodes()
      .filter((node) => node.kind === UI_NODE_KINDS.app)
      .flatMap((app) => CommunityCapabilitiesRule.app(graph, app));
  }

  /** Нарушения одного приложения: его сигналы и реакции против его мессенджера. */
  private static app(graph: Graph, app: GraphNode): string[] {
    const children = graph.children(app.id);
    const community = children.filter(
      (node) =>
        node.kind === CHAT_NODE_KINDS.signal ||
        node.kind === CHAT_NODE_KINDS.reaction,
    );
    if (community.length === 0) return [];
    const messenger = children.find(
      (node) => node.kind === CHAT_NODE_KINDS.messenger,
    );
    if (messenger === undefined) {
      return community.map(
        (node) =>
          `приложение ${app.id}: ${CommunityCapabilitiesRule.what(node)} ${node.id} — у приложения нет мессенджера`,
      );
    }
    const parsed = v.safeParse(MessengerCapabilitiesSchema, messenger.props);
    if (!parsed.success) return [];
    return community.flatMap((node) =>
      CommunityCapabilitiesRule.node(app, node, parsed.output),
    );
  }

  /** Строка о сигнале или реакции, которых мессенджер не умеет; свойства не по схеме — нет строки. */
  private static node(
    app: GraphNode,
    node: GraphNode,
    { name, community }: MessengerCapabilities,
  ): string[] {
    if (node.kind === CHAT_NODE_KINDS.signal) {
      const props = v.safeParse(CHAT_SIGNAL_PROPS, node.props);
      if (!props.success || community.signals.includes(props.output.signal)) {
        return [];
      }
      return [
        `приложение ${app.id}: сигнал ${node.id} (${props.output.signal}) — мессенджер ${name} его не принимает`,
      ];
    }
    const props = v.safeParse(CHAT_REACTION_PROPS, node.props);
    if (
      !props.success ||
      community.operations.includes(props.output.operation)
    ) {
      return [];
    }
    return [
      `приложение ${app.id}: реакция ${node.id} (${props.output.operation}) — мессенджер ${name} её не исполняет`,
    ];
  }

  /** Слово вида узла для текста. */
  private static what(node: GraphNode): string {
    return node.kind === CHAT_NODE_KINDS.signal ? 'сигнал' : 'реакция';
  }
}
