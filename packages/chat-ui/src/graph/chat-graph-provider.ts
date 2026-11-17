import {
  DomainIds,
  type GraphContribution,
  type GraphEdgeInput,
  type GraphKinds,
  type GraphNodeInput,
  type GraphProvider,
  type GraphRule,
} from 'dmg-core/graph';
import { type AnyUiAppDef, UiIds } from 'dmg-ui';
import { UI_EDGE_KINDS } from 'dmg-ui/graph';
import * as v from 'valibot';
import { CommunityManifest } from '../community/community-manifest';
import { MessengerCapabilitiesSchema } from '../messenger/capabilities-schema';
import type {
  ChatAppSpec,
  ChatEntryPointSpec,
  ChatGraphSpec,
  NumberedEntryPoint,
} from './chat-graph-provider.types';
import { ChatIds } from './chat-ids';
import {
  CHAT_EDGE_KINDS,
  CHAT_KINDS,
  CHAT_NODE_KINDS,
  CHAT_PROVIDER,
  CHAT_VERSION,
} from './chat-kinds';
import { CommunityCapabilitiesRule } from './rules/community-capabilities.rule';
import { EntryPointRule } from './rules/entry-point.rule';
import { ExampleLimitsRule } from './rules/example-limits.rule';

export type {
  ChatAppSpec,
  ChatEntryPointSpec,
  ChatGraphSpec,
} from './chat-graph-provider.types';

/**
 * Поставщик графа общей части мессенджеров (D-UI-57) — один на все
 * приложения: под приложением UI узлы `chatMessenger`, `chatEntry`,
 * `chatEntryPoint`, сигналы `chatSignal` и реакции `chatReaction` сообщества;
 * рёбра `presents` — от реестра; правила CH-01…CH-03. Бросок — повтор
 * приложения, реестр или примеры другого набора, возможности не по схеме,
 * точка на несуществующий вход, манифест не прошёл `CommunityManifest`.
 */
export class ChatGraphProvider implements GraphProvider {
  readonly name = CHAT_PROVIDER;
  readonly version = CHAT_VERSION;

  private readonly communities = new Map<AnyUiAppDef, CommunityManifest>();

  constructor(private readonly spec: ChatGraphSpec) {
    const seen = new Set<string>();
    for (const {
      app,
      views,
      capabilities,
      entryPoints = [],
      community,
    } of spec.apps) {
      if (seen.has(app.name)) {
        throw new Error(
          `ChatGraphProvider: приложение ${app.name} указано дважды`,
        );
      }
      seen.add(app.name);
      if (views.set !== app.set) {
        throw new Error(
          `ChatGraphProvider: реестр представлений приложения ${app.name} — не для набора приложения`,
        );
      }
      if (spec.examples.set !== app.set) {
        throw new Error(
          `ChatGraphProvider: примеры приложения ${app.name} — не для набора приложения`,
        );
      }
      if (!v.is(MessengerCapabilitiesSchema, capabilities)) {
        throw new Error(
          `ChatGraphProvider: возможности мессенджера приложения ${app.name} не по схеме`,
        );
      }
      for (const { entry } of entryPoints) {
        if (!Object.hasOwn(app.entries, entry)) {
          throw new Error(
            `ChatGraphProvider: точка входа приложения ${app.name} ссылается на вход ${entry}, которого у приложения нет`,
          );
        }
      }
      this.communities.set(app, new CommunityManifest(app, community ?? {}));
    }
  }

  kinds(): GraphKinds {
    return CHAT_KINDS;
  }

  /** CH-01: примеры в лимитах мессенджера; CH-02: у входа есть точка входа; CH-03: мессенджер умеет сигналы и реакции. */
  rules(): readonly GraphRule[] {
    return [
      new ExampleLimitsRule({
        examples: this.spec.examples,
        views: new Map(
          this.spec.apps.map(({ app, views }) => [
            new UiIds(app.set).app(app),
            views,
          ]),
        ),
      }),
      new EntryPointRule(),
      new CommunityCapabilitiesRule(),
    ];
  }

  contribute(): GraphContribution {
    return {
      nodes: this.spec.apps.flatMap((spec) => this.nodes(spec)),
      edges: this.spec.apps.flatMap((spec) => this.edges(spec)),
    };
  }

  private nodes({
    app,
    capabilities,
    entryPoints = [],
  }: ChatAppSpec): GraphNodeInput[] {
    const ids = new ChatIds(app.set);
    return [
      {
        kind: CHAT_NODE_KINDS.messenger,
        id: ids.messenger(app),
        label: capabilities.name,
        description: `Мессенджер приложения ${app.name}.`,
        props: capabilities,
      },
      ...Object.entries(app.entries).map(([entry, spec]) => ({
        kind: CHAT_NODE_KINDS.entry,
        id: ids.entry(app, entry),
        label: spec.label,
        description: spec.description,
        props: { entry },
      })),
      ...ChatGraphProvider.numbered(entryPoints).map(({ point, n }) => ({
        kind: CHAT_NODE_KINDS.point,
        id: ids.point(app, point.entry, n),
        label: `Точка входа ${point.entry} ${n}`,
        description: `Точка входа ${n} на вход ${point.entry} приложения ${app.name}.`,
        props: { entry: point.entry, via: point.via, key: point.key },
      })),
      ...this.community(app).signals.map((signal) => ({
        kind: CHAT_NODE_KINDS.signal,
        id: ids.signal(app, signal.name),
        label: signal.label,
        description: signal.description,
        props: { signal: signal.signal },
      })),
      ...this.community(app).reactions.map((reaction) => ({
        kind: CHAT_NODE_KINDS.reaction,
        id: ids.reaction(app, reaction.name),
        label: reaction.label,
        description: reaction.description,
        props: { operation: reaction.operation },
      })),
    ];
  }

  /**
   * Рёбра `chatEnters` из Def приложения (`entries`), `chatOpens` — из точек
   * входа, `presents` — из `presented()`; от сигнала `invokes` к UC, от
   * реакции `notifiedBy` к событию и `reads` к UC — концы по `DomainIds`.
   */
  private edges({
    app,
    views,
    entryPoints = [],
  }: ChatAppSpec): GraphEdgeInput[] {
    const ui = new UiIds(app.set);
    const ids = new ChatIds(app.set);
    const from = ui.app(app);
    const domain = new DomainIds(app.set.app);
    const { signals, reactions } = this.community(app);
    return [
      ...Object.entries(app.entries).map(([entry, spec]) => ({
        kind: CHAT_EDGE_KINDS.enters,
        from: ids.entry(app, entry),
        to: ui.screen(spec.address.screen),
      })),
      ...ChatGraphProvider.numbered(entryPoints).map(({ point, n }) => ({
        kind: CHAT_EDGE_KINDS.opens,
        from: ids.point(app, point.entry, n),
        to: ids.entry(app, point.entry),
      })),
      ...views.presented().map((to) => ({
        kind: UI_EDGE_KINDS.presents,
        from,
        to,
      })),
      ...signals.map((signal) => ({
        kind: UI_EDGE_KINDS.invokes,
        from: ids.signal(app, signal.name),
        to: domain.operation(signal.uc),
      })),
      ...reactions.flatMap((reaction) => [
        {
          kind: UI_EDGE_KINDS.notifiedBy,
          from: ids.reaction(app, reaction.name),
          to: domain.event(reaction.event),
        },
        {
          kind: UI_EDGE_KINDS.reads,
          from: ids.reaction(app, reaction.name),
          to: domain.operation(reaction.uc),
        },
      ]),
    ];
  }

  /** Проверенные манифесты сообщества приложения; без `community` — пустые списки. */
  private community(app: AnyUiAppDef): CommunityManifest {
    return this.communities.get(app) ?? new CommunityManifest(app, {});
  }

  /** Номер точки внутри её входа, с 1, в порядке `entryPoints`. */
  private static numbered(
    points: readonly ChatEntryPointSpec[],
  ): NumberedEntryPoint[] {
    const counts = new Map<string, number>();
    return points.map((point) => {
      const n = (counts.get(point.entry) ?? 0) + 1;
      counts.set(point.entry, n);
      return { point, n };
    });
  }
}
