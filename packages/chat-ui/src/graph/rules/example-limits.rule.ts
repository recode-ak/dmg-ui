import type { Graph, GraphNode, GraphRule } from 'dmg-core/graph';
import { UI_EDGE_KINDS } from 'dmg-ui/graph';
import * as v from 'valibot';
import { MessengerCapabilitiesSchema } from '../../messenger/capabilities-schema';
import type { MessengerCapabilities } from '../../messenger/messenger.types';
import type { ChatViews } from '../../view/chat-views';
import { VIEW_TEXTS } from '../../view/view.const';
import type { ChatExamples } from '../chat-examples';
import { CHAT_NODE_KINDS } from '../chat-kinds';
import { NOT_COMPOSED } from './example-limits.const';
import type {
  ExampleLimitsSpec,
  NoticeLink,
} from './example-limits.rule.types';
import { NotificationLimits } from './notification-limits';
import { ScreenLimits } from './screen-limits';

export type { ExampleLimitsSpec } from './example-limits.rule.types';

/**
 * CH-01 (D-UI-58): примеры экранов и уведомлений, которые приложение
 * показывает (`presents`), укладываются в лимиты его мессенджера (узел
 * `chatMessenger`). Число вариантов и ссылки — не нарушение. `check` не
 * бросает: свойства не по схеме и дефект представления — строкой.
 */
export class ExampleLimitsRule implements GraphRule {
  readonly id = 'CH-01';
  private readonly examples: ChatExamples;
  private readonly views: ReadonlyMap<string, ChatViews>;

  constructor(spec: ExampleLimitsSpec) {
    this.examples = spec.examples;
    this.views = spec.views;
  }

  check(graph: Graph): readonly string[] {
    return graph
      .nodes()
      .filter((node) => node.kind === CHAT_NODE_KINDS.messenger)
      .flatMap((node) => this.app(graph, node));
  }

  /** Нарушения одного приложения — родителя узла мессенджера. */
  private app(graph: Graph, messenger: GraphNode): string[] {
    const app = messenger.parent;
    const views = app === undefined ? undefined : this.views.get(app);
    if (app === undefined || views === undefined) return [];
    const parsed = v.safeParse(MessengerCapabilitiesSchema, messenger.props);
    if (!parsed.success) {
      return [`приложение ${app}: возможности мессенджера не по схеме`];
    }
    const presented = new Set(
      graph.outgoing(app, UI_EDGE_KINDS.presents).map((edge) => edge.to),
    );
    return [
      ...this.screens(app, views, parsed.output, presented),
      ...this.notifications(graph, app, views, parsed.output, presented),
    ];
  }

  private screens(
    app: string,
    views: ChatViews,
    capabilities: MessengerCapabilities,
    presented: ReadonlySet<string>,
  ): string[] {
    const limits = new ScreenLimits(views, capabilities);
    return this.examples
      .screens()
      .filter(({ id }) => presented.has(id))
      .flatMap(({ id, name, view }) =>
        ExampleLimitsRule.lines(
          `приложение ${app}: экран ${id}, пример ${name}`,
          () => limits.check(view),
        ),
      );
  }

  private notifications(
    graph: Graph,
    app: string,
    views: ChatViews,
    capabilities: MessengerCapabilities,
    presented: ReadonlySet<string>,
  ): string[] {
    const limits = new NotificationLimits(views, capabilities);
    return this.examples
      .notifications()
      .filter(({ id }) => presented.has(id))
      .flatMap(({ id, name, data }) =>
        ExampleLimitsRule.lines(
          `приложение ${app}: уведомление ${id}, пример ${name}`,
          () => limits.check(id, data, ExampleLimitsRule.links(graph, id)),
        ),
      );
  }

  /** Ссылки уведомления (`links`) с подписью экрана-цели — как её ставит беседа. */
  private static links(graph: Graph, notification: string): NoticeLink[] {
    return graph.outgoing(notification, UI_EDGE_KINDS.links).map((edge) => ({
      screen: edge.to,
      label: graph.node(edge.to)?.label ?? VIEW_TEXTS.open,
    }));
  }

  /** Строки примера с местом; бросок меры — одна строка без текста броска. */
  private static lines(place: string, measure: () => string[]): string[] {
    try {
      return measure().map((problem) => `${place}: ${problem}`);
    } catch {
      return [`${place}: ${NOT_COMPOSED}`];
    }
  }
}
