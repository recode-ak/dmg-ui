import type { Graph, GraphNode } from 'dmg-core/graph';
import * as v from 'valibot';
import { EVENT_KIND, EVENT_VIEW, UC_KIND, UC_VIEW } from './ui-domain-props';
import type {
  ActionView,
  AppView,
  NotificationView,
  RefreshedByView,
  ScreenView,
  StoryView,
  UcView,
  UiEntry,
} from './ui-graph-reader.types';
import { UI_EDGE_KINDS, UI_NODE_KINDS } from './ui-kinds';
import { UI_PROPS } from './ui-props';

/**
 * Общие запросы правил к графу: узлы видов ядра UI с разобранными свойствами,
 * состав сторис и приложений, UC экрана. Узлы идут в порядке графа (по `id`),
 * поэтому тексты нарушений детерминированы.
 */
export class UiGraphReader {
  constructor(private readonly graph: Graph) {}

  apps(): UiEntry<AppView>[] {
    return this.entries(UI_NODE_KINDS.app, UI_PROPS.uiApp);
  }

  stories(): UiEntry<StoryView>[] {
    return this.entries(UI_NODE_KINDS.story, UI_PROPS.story);
  }

  screens(): UiEntry<ScreenView>[] {
    return this.entries(UI_NODE_KINDS.screen, UI_PROPS.screen);
  }

  notifications(): UiEntry<NotificationView>[] {
    return this.entries(UI_NODE_KINDS.notification, UI_PROPS.notification);
  }

  actions(): UiEntry<ActionView>[] {
    return this.entries(UI_NODE_KINDS.action, UI_PROPS.action);
  }

  /** Узлы перечисленных видов в порядке графа. */
  nodes(...kinds: readonly string[]): GraphNode[] {
    return this.graph.nodes().filter((node) => kinds.includes(node.kind));
  }

  /** `id` концов исходящих рёбер вида `kind`. */
  targets(from: string, kind: string): string[] {
    return this.graph.outgoing(from, kind).map((edge) => edge.to);
  }

  /** `id` начал входящих рёбер вида `kind`. */
  sources(to: string, kind: string): string[] {
    return this.graph.incoming(to, kind).map((edge) => edge.from);
  }

  kindOf(id: string): string | undefined {
    return this.graph.node(id)?.kind;
  }

  /** Экраны сторис. */
  storyScreens(storyId: string): string[] {
    return this.targets(storyId, UI_EDGE_KINDS.includes);
  }

  /** Сторис, включающие экран. */
  storiesOf(screenId: string): string[] {
    return this.sources(screenId, UI_EDGE_KINDS.includes).filter(
      (id) => this.kindOf(id) === UI_NODE_KINDS.story,
    );
  }

  /** Сторис из связей сторис (рёбра `leads`). */
  leadsOf(storyId: string): string[] {
    return this.targets(storyId, UI_EDGE_KINDS.leads);
  }

  /** `id` стартового экрана сторис; нет узла или свойства не по схеме — `undefined`. */
  startOf(storyId: string): string | undefined {
    const node = this.graph.node(storyId);
    if (node?.kind !== UI_NODE_KINDS.story) return undefined;
    return UiGraphReader.parse(UI_PROPS.story, node)?.start;
  }

  /** Исходы сторис с целями; нет узла или свойства не по схеме — пусто. */
  outcomesOf(storyId: string): StoryView['outcomes'] {
    const node = this.graph.node(storyId);
    if (node?.kind !== UI_NODE_KINDS.story) return [];
    return UiGraphReader.parse(UI_PROPS.story, node)?.outcomes ?? [];
  }

  /** Сторис из связей сторис `storyIds`, чей стартовый экран — `to`. */
  ledTo(storyIds: readonly string[], to: string): string[] {
    return storyIds
      .flatMap((story) => this.leadsOf(story))
      .filter((lead) => this.startOf(lead) === to);
  }

  /** Сторис приложения UI. */
  appStories(appId: string): string[] {
    return this.appIncludes(appId, UI_NODE_KINDS.story);
  }

  /** Уведомления приложения UI. */
  appNotifications(appId: string): string[] {
    return this.appIncludes(appId, UI_NODE_KINDS.notification);
  }

  /** Экраны сторис приложения UI. */
  appScreens(appId: string): Set<string> {
    return new Set(
      this.appStories(appId).flatMap((story) => this.storyScreens(story)),
    );
  }

  /** Узлы из набора `ids` в порядке графа. */
  inGraphOrder(ids: ReadonlySet<string>): GraphNode[] {
    return this.graph.nodes().filter((node) => ids.has(node.id));
  }

  /** Действия экрана с разобранными свойствами. */
  actionsOf(screenId: string): UiEntry<ActionView>[] {
    const found: UiEntry<ActionView>[] = [];
    for (const node of this.graph.children(screenId)) {
      if (node.kind !== UI_NODE_KINDS.action) continue;
      const props = UiGraphReader.parse(UI_PROPS.action, node);
      if (props) found.push({ node, props });
    }
    return found;
  }

  /** Имена действий экрана: хвост `id` после `id` экрана. */
  actionNames(screenId: string): string[] {
    return this.actionsOf(screenId).map(({ node }) =>
      node.id.slice(screenId.length + 1),
    );
  }

  /** UC экрана: чтение загрузки и вызовы его действий, без повторов. */
  ucsOf(screenId: string): string[] {
    const reads = this.targets(screenId, UI_EDGE_KINDS.reads);
    const calls = this.actionsOf(screenId).flatMap(({ node }) =>
      this.targets(node.id, UI_EDGE_KINDS.invokes),
    );
    return [...new Set([...reads, ...calls])];
  }

  /** Свойства узла UC; нет узла (внешняя ссылка) — `undefined`. */
  uc(id: string): UcView | undefined {
    const node = this.graph.node(id);
    return node?.kind === UC_KIND
      ? UiGraphReader.parse(UC_VIEW, node)
      : undefined;
  }

  /** Имена полей payload события; события нет в графе — `undefined`. */
  payloadFields(eventId: string): Set<string> | undefined {
    const node = this.graph.node(eventId);
    if (node?.kind !== EVENT_KIND) return undefined;
    const view = UiGraphReader.parse(EVENT_VIEW, node);
    if (!view) return undefined;
    const properties = view.payload.properties;
    const names =
      typeof properties === 'object' && properties !== null
        ? Object.keys(properties)
        : [];
    return new Set(names);
  }

  /** Записи перечитывания ребра `refreshedBy`; свойства не по схеме — `undefined`. */
  refreshRecords(from: string, to: string): RefreshedByView | undefined {
    const edge = this.graph
      .outgoing(from, UI_EDGE_KINDS.refreshedBy)
      .find((e) => e.to === to);
    return edge ? UiGraphReader.parse(UI_PROPS.refreshedBy, edge) : undefined;
  }

  private appIncludes(appId: string, kind: string): string[] {
    return this.targets(appId, UI_EDGE_KINDS.includes).filter(
      (id) => this.kindOf(id) === kind,
    );
  }

  private entries<S extends v.GenericSchema>(
    kind: string,
    schema: S,
  ): UiEntry<v.InferOutput<S>>[] {
    const found: UiEntry<v.InferOutput<S>>[] = [];
    for (const node of this.nodes(kind)) {
      const props = UiGraphReader.parse(schema, node);
      if (props) found.push({ node, props });
    }
    return found;
  }

  /** Свойства по схеме; не по схеме — `undefined` (правило не бросает). */
  private static parse<S extends v.GenericSchema>(
    schema: S,
    holder: { readonly props: unknown },
  ): v.InferOutput<S> | undefined {
    const result = v.safeParse(schema, holder.props);
    return result.success ? result.output : undefined;
  }
}
