import type {
  GraphContribution,
  GraphEdgeInput,
  GraphKinds,
  GraphNodeInput,
  GraphProvider,
  GraphRule,
} from 'dmg-core/graph';
import { UiIds } from 'dmg-ui';
import { UI_EDGE_KINDS } from 'dmg-ui/graph';
import * as v from 'valibot';
import { MessengerCapabilitiesSchema } from '../messenger/capabilities-schema';
import type {
  ChatAppSpec,
  ChatEntryPointSpec,
  ChatGraphSpec,
} from './chat-graph-provider.types';
import { ChatIds } from './chat-ids';
import {
  CHAT_EDGE_KINDS,
  CHAT_KINDS,
  CHAT_NODE_KINDS,
  CHAT_PROVIDER,
  CHAT_VERSION,
} from './chat-kinds';
import { EntryPointRule } from './rules/entry-point.rule';
import { ExampleLimitsRule } from './rules/example-limits.rule';

export type {
  ChatAppSpec,
  ChatEntryPointSpec,
  ChatGraphSpec,
} from './chat-graph-provider.types';

/**
 * Поставщик графа общей части мессенджеров (D-UI-57) — один на все
 * приложения: под приложением UI узел `chatMessenger`, входы `chatEntry`
 * (ребро `chatEnters`), точки входа `chatEntryPoint` (ребро `chatOpens`),
 * рёбра `presents` — от реестра; правила CH-01, CH-02. Повтор приложения,
 * реестр или примеры другого набора, возможности не по схеме, точка на
 * несуществующий вход — бросок.
 */
export class ChatGraphProvider implements GraphProvider {
  readonly name = CHAT_PROVIDER;
  readonly version = CHAT_VERSION;

  constructor(private readonly spec: ChatGraphSpec) {
    const seen = new Set<string>();
    for (const { app, views, capabilities, entryPoints = [] } of spec.apps) {
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
    }
  }

  kinds(): GraphKinds {
    return CHAT_KINDS;
  }

  /** CH-01: примеры в лимитах мессенджера своего приложения; CH-02: у входа есть точка входа. */
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
    ];
  }

  /** Рёбра `chatEnters` из Def приложения (`entries`), `chatOpens` — из точек входа, `presents` — из `presented()`. */
  private edges({
    app,
    views,
    entryPoints = [],
  }: ChatAppSpec): GraphEdgeInput[] {
    const ui = new UiIds(app.set);
    const ids = new ChatIds(app.set);
    const from = ui.app(app);
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
    ];
  }

  /** Номер точки внутри её входа, с 1, в порядке `entryPoints`. */
  private static numbered(
    points: readonly ChatEntryPointSpec[],
  ): { point: ChatEntryPointSpec; n: number }[] {
    const counts = new Map<string, number>();
    return points.map((point) => {
      const n = (counts.get(point.entry) ?? 0) + 1;
      counts.set(point.entry, n);
      return { point, n };
    });
  }
}
