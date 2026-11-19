import type {
  AnyDomainRule,
  AnyErrorDef,
  AnyEventDef,
  AnyUseCaseDef,
} from 'dmg-core';
import { DomainIds, type GraphEdgeInput } from 'dmg-core/graph';
import { Address } from '../address/address';
import type { UiIds } from '../address/ui-ids';
import type { UiTarget } from '../address/ui-ids.types';
import { AppReach } from '../manifest/app-reach';
import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { RefreshOn } from '../manifest/refresh-on';
import type { ScreenAction } from '../manifest/screen-action';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyStoryDef, OutcomeSpec } from '../manifest/story-def.types';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import { UI_EDGE_KINDS } from './ui-kinds';
import type {
  UiRefreshedByProps,
  UiRefreshRecordProps,
} from './ui-props.types';

/**
 * Рёбра графа по Def набора UI и приложений UI. Концы — через `UiIds` и
 * `DomainIds`, а не по именам; одно ребро на тройку `(kind, from, to)`.
 */
export class UiEdges {
  private readonly domain: DomainIds;

  constructor(
    private readonly set: AnyUiSetDef,
    private readonly apps: readonly AnyUiAppDef[],
    private readonly ids: UiIds,
  ) {
    this.domain = new DomainIds(set.app);
  }

  list(): GraphEdgeInput[] {
    const known = new Map<string, GraphEdgeInput>();
    const put = (edge: GraphEdgeInput) => {
      known.set(`${edge.kind} ${edge.from} ${edge.to}`, edge);
    };
    for (const module of this.set.modules) {
      for (const story of module.stories) this.storyEdges(story).forEach(put);
      for (const screen of module.screens) {
        this.screenEdges(screen).forEach(put);
      }
      for (const notification of module.notifications ?? []) {
        this.notificationEdges(notification).forEach(put);
      }
    }
    for (const app of this.apps) this.appEdges(app).forEach(put);
    return [...known.values()];
  }

  /**
   * Экраны сторис, связи с другими сторис, доменные правила и экраны целей
   * исходов-адресов (`redirects`).
   */
  private storyEdges(story: AnyStoryDef): GraphEdgeInput[] {
    const from = this.ids.story(story);
    return [
      ...story.screens.map((screen) => this.edge('includes', from, screen)),
      ...story.leads().map((lead) => this.edge('leads', from, lead)),
      ...story.rules.map((rule) => this.rule(from, rule)),
      ...Object.values<OutcomeSpec>(story.outcomes).flatMap((outcome) =>
        outcome.after instanceof Address
          ? [this.edge('redirects', from, outcome.after.screen)]
          : [],
      ),
    ];
  }

  /** Состав приложения; `omits` — сторис из связей, не вошедшие в него. */
  private appEdges(app: AnyUiAppDef): GraphEdgeInput[] {
    const from = this.ids.app(app);
    return [
      ...app.stories.map((story) => this.edge('includes', from, story)),
      ...AppReach.of(app)
        .omitted()
        .map((story) => this.edge('omits', from, story)),
      ...app.notifications.map((n) => this.edge('includes', from, n)),
      ...Object.values(app.entries).map((entry) =>
        this.edge('entry', from, entry.address.screen),
      ),
    ];
  }

  private screenEdges(screen: AnyScreenDef): GraphEdgeInput[] {
    const from = this.ids.screen(screen);
    const edges: GraphEdgeInput[] = [
      ...screen.reads.map((uc) => this.operation('reads', from, uc)),
      ...screen.catches.map((error) => this.error(from, error)),
      ...this.refreshEdges(from, screen.refresh),
    ];
    for (const action of Object.values<ScreenAction>(screen.actions)) {
      edges.push(...this.actionEdges(screen, action));
    }
    return edges;
  }

  private actionEdges(
    screen: AnyScreenDef,
    action: ScreenAction,
  ): GraphEdgeInput[] {
    const from = this.ids.action(screen, action.name);
    return [
      ...(action.uc ? [this.operation('invokes', from, action.uc)] : []),
      ...action.targets().map((to) => this.edge('leadsTo', from, to)),
    ];
  }

  private notificationEdges(
    notification: AnyNotificationDef,
  ): GraphEdgeInput[] {
    const from = this.ids.notification(notification);
    return [
      ...notification.reads.map((uc) => this.operation('reads', from, uc)),
      ...(notification.recipients.from === 'query'
        ? [this.operation('recipients', from, notification.recipients.uc)]
        : []),
      this.event('notifiedBy', from, notification.event),
      ...notification.links().map((to) => this.edge('links', from, to)),
    ];
  }

  /** Записи одного события экрана собираются в одно ребро со списком. */
  private refreshEdges(
    from: string,
    refresh: readonly RefreshOn[],
  ): GraphEdgeInput[] {
    const byEvent = new Map<string, UiRefreshRecordProps[]>();
    for (const record of refresh) {
      const to = this.domain.event(record.event);
      const records = byEvent.get(to) ?? [];
      records.push({
        params: record.params,
        ...(record.subject === undefined ? {} : { subject: record.subject }),
        any: record.any,
      });
      byEvent.set(to, records);
    }
    return [...byEvent].map(([to, records]) => {
      const props: UiRefreshedByProps = { records };
      return { kind: UI_EDGE_KINDS.refreshedBy, from, to, props };
    });
  }

  private edge(
    kind: keyof typeof UI_EDGE_KINDS,
    from: string,
    def: UiTarget,
  ): GraphEdgeInput {
    return { kind: UI_EDGE_KINDS[kind], from, to: this.ids.target(def) };
  }

  private operation(
    kind: keyof typeof UI_EDGE_KINDS,
    from: string,
    uc: AnyUseCaseDef,
  ): GraphEdgeInput {
    return { kind: UI_EDGE_KINDS[kind], from, to: this.domain.operation(uc) };
  }

  private event(
    kind: keyof typeof UI_EDGE_KINDS,
    from: string,
    event: AnyEventDef,
  ): GraphEdgeInput {
    return { kind: UI_EDGE_KINDS[kind], from, to: this.domain.event(event) };
  }

  private rule(from: string, rule: AnyDomainRule): GraphEdgeInput {
    return {
      kind: UI_EDGE_KINDS.requires,
      from,
      to: this.domain.rule(rule),
    };
  }

  private error(from: string, error: AnyErrorDef): GraphEdgeInput {
    return {
      kind: UI_EDGE_KINDS.catches,
      from,
      to: this.domain.error(error),
    };
  }
}
