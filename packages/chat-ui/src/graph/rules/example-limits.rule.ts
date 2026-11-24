import type { Graph, GraphNode, GraphRule } from 'dmg-core/graph';
import { UI_EDGE_KINDS } from 'dmg-ui/graph';
import * as v from 'valibot';
import { MessengerCapabilitiesSchema } from '../../messenger/capabilities-schema';
import type { MessengerCapabilities } from '../../messenger/messenger.types';
import type { AppChatViews } from '../../view/app-chat-views';
import { VIEW_TEXTS } from '../../view/view.const';
import type { ChatExamples } from '../chat-examples';
import { CHAT_NODE_KINDS } from '../chat-kinds';
import { NOT_COMPOSED } from './example-limits.const';
import type { ExampleLimitsSpec, NoticeLink } from './example-limits.types';
import { NotificationLimits } from './notification-limits';
import { ScreenLimits } from './screen-limits';

export type { ExampleLimitsSpec } from './example-limits.types';

/**
 * CH-01 (D-UI-58): примеры экранов и уведомлений, которые приложение
 * показывает (`presents`), укладываются в лимиты его мессенджера (узел
 * `chatMessenger`). Число вариантов экрана — не нарушение, число ссылок
 * уведомления — нарушение. `check` не бросает: свойства не по схеме и
 * дефект представления — строкой, цель вне сборки представлений — молча.
 */
export class ExampleLimitsRule implements GraphRule {
  readonly id = 'CH-01';
  private readonly examples: ChatExamples;
  private readonly views: ReadonlyMap<string, AppChatViews>;

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
    const targets = ExampleLimitsRule.targets(graph, app, views);
    return [
      ...this.screens(app, views, parsed.output, targets),
      ...this.notifications(graph, app, views, parsed.output, targets),
    ];
  }

  /** Цели меры: концы `presents` от приложения, у которых есть представление в его сборке. */
  private static targets(
    graph: Graph,
    app: string,
    views: AppChatViews,
  ): ReadonlySet<string> {
    const registered = new Set(views.presented());
    return new Set(
      graph
        .outgoing(app, UI_EDGE_KINDS.presents)
        .map((edge) => edge.to)
        .filter((id) => registered.has(id)),
    );
  }

  private screens(
    app: string,
    views: AppChatViews,
    capabilities: MessengerCapabilities,
    targets: ReadonlySet<string>,
  ): string[] {
    const limits = new ScreenLimits(views, capabilities);
    return this.examples
      .screens()
      .filter(({ id }) => targets.has(id))
      .flatMap(({ id, name, view }) =>
        ExampleLimitsRule.lines(
          `приложение ${app}: экран ${id}, пример ${name}`,
          () => limits.compose(view),
          (messages) => limits.check(messages),
        ),
      );
  }

  private notifications(
    graph: Graph,
    app: string,
    views: AppChatViews,
    capabilities: MessengerCapabilities,
    targets: ReadonlySet<string>,
  ): string[] {
    const limits = new NotificationLimits(capabilities);
    return this.examples
      .notifications()
      .filter(({ id }) => targets.has(id))
      .flatMap(({ id, name, data }) => {
        const presenter = views.notification(id);
        const links = ExampleLimitsRule.links(graph, id);
        return ExampleLimitsRule.lines(
          `приложение ${app}: уведомление ${id}, пример ${name}`,
          () => presenter.text(data),
          (text) => limits.check(text, links),
        );
      });
  }

  /** Ссылки уведомления (`links`) с подписью экрана-цели — как её ставит беседа. */
  private static links(graph: Graph, notification: string): NoticeLink[] {
    return graph.outgoing(notification, UI_EDGE_KINDS.links).map((edge) => ({
      screen: edge.to,
      label: graph.node(edge.to)?.label ?? VIEW_TEXTS.open,
    }));
  }

  /**
   * Строки примера с местом. В `try` — только вызов представления: его
   * бросок — одна строка без текста броска; мера идёт вне `try`.
   */
  private static lines<T>(
    place: string,
    show: () => T,
    measure: (shown: T) => readonly string[],
  ): string[] {
    let shown: T;
    try {
      shown = show();
    } catch {
      return [`${place}: ${NOT_COMPOSED}`];
    }
    return measure(shown).map((problem) => `${place}: ${problem}`);
  }
}
