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
import { PAGE_CHANNEL, PAGE_VERSION } from '../page-channel.const';
import type { AnyPageRouteDef } from '../url/page-route-def.types';
import { EntryRouteRule } from './entry-route.rule';
import type { PageGraphSpec } from './page-graph-provider.types';
import { PAGE_EDGE_KINDS, PAGE_KINDS, PAGE_NODE_KINDS } from './page-kinds';
import { RouteEntryRule } from './route-entry.rule';

export type { PageGraphSpec } from './page-graph-provider.types';

/**
 * Второй поставщик графа — страничный канал: узлы маршрутов под приложением
 * UI, ребро `opens` к экрану входа и рёбра `presents` к представлениям.
 * Правила канала — PG-01 и PG-02. Повтор `path` у маршрутов — ошибка сборки.
 */
export class PageGraphProvider implements GraphProvider {
  readonly name = PAGE_CHANNEL;
  readonly version = PAGE_VERSION;
  private readonly ids: UiIds;

  constructor(private readonly spec: PageGraphSpec) {
    this.ids = new UiIds(spec.app.set);
    const seen = new Set<string>();
    for (const route of spec.routes) {
      if (seen.has(route.path)) {
        throw new Error(
          `PageGraphProvider: путь ${route.path} у двух маршрутов приложения ${spec.app.name}`,
        );
      }
      seen.add(route.path);
    }
  }

  kinds(): GraphKinds {
    return PAGE_KINDS;
  }

  contribute(): GraphContribution {
    const app = this.ids.app(this.spec.app);
    return {
      nodes: this.spec.routes.map((route) => this.node(app, route)),
      edges: [
        ...this.spec.routes.flatMap((route) => this.opens(app, route)),
        ...this.spec.views.presented().map((to) => ({
          kind: UI_EDGE_KINDS.presents,
          from: app,
          to,
        })),
      ],
    };
  }

  rules(): readonly GraphRule[] {
    return [
      new RouteEntryRule(),
      new EntryRouteRule(this.ids.app(this.spec.app)),
    ];
  }

  private node(app: string, route: AnyPageRouteDef): GraphNodeInput {
    return {
      kind: PAGE_NODE_KINDS.route,
      id: `${app}/${route.name}`,
      label: route.label,
      description: route.description,
      visible: route.visible,
      props: { path: route.path, entry: route.entry },
    };
  }

  /** Ребро `opens` — только если приложение объявило вход `route.entry`. */
  private opens(app: string, route: AnyPageRouteDef): GraphEdgeInput[] {
    const entry = this.spec.app.entries[route.entry];
    if (entry === undefined) return [];
    return [
      {
        kind: PAGE_EDGE_KINDS.opens,
        from: `${app}/${route.name}`,
        to: this.ids.screen(entry.address.screen),
      },
    ];
  }
}
