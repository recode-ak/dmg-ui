import type {
  GraphContribution,
  GraphEdgeInput,
  GraphKinds,
  GraphNodeInput,
  GraphProvider,
  GraphRule,
} from 'dmg-core/graph';
import { UiIds } from 'dmg-ui';
import { PAGE_CHANNEL, PAGE_VERSION } from '../page-channel.const';
import type { AnyPageRouteDef } from '../url/page-route-def.types';
import type { PageAppSpec, PageGraphSpec } from './page-graph-provider.types';
import { PAGE_EDGE_KINDS, PAGE_KINDS, PAGE_NODE_KINDS } from './page-kinds';
import { EntryRouteRule } from './rules/entry-route.rule';
import { RouteCommonRule } from './rules/route-common.rule';
import { RouteEntryRule } from './rules/route-entry.rule';
import { RouteOverlapRule } from './rules/route-overlap.rule';
import { RouteParamsRule } from './rules/route-params.rule';
import { RoutePathRule } from './rules/route-path.rule';
import { ScreenUrlRule } from './rules/screen-url.rule';

export type { PageAppSpec, PageGraphSpec } from './page-graph-provider.types';

/**
 * Поставщик графа страничного канала (D-UI-77) — один на все приложения web:
 * узлы маршрутов под приложением UI, ребро `opens` к экрану входа. Правила —
 * PG-01…PG-07. Бросок конструктора — только структура спеки: повтор
 * приложения, разные наборы UI; остальное (пути, параметры) — правила.
 */
export class PageGraphProvider implements GraphProvider {
  readonly name = PAGE_CHANNEL;
  readonly version = PAGE_VERSION;

  constructor(private readonly spec: PageGraphSpec) {
    const seen = new Set<string>();
    for (const { app } of spec.apps) {
      if (seen.has(app.name)) {
        throw new Error(
          `PageGraphProvider: приложение ${app.name} указано дважды`,
        );
      }
      seen.add(app.name);
    }
    if (new Set(spec.apps.map(({ app }) => app.set)).size > 1) {
      throw new Error('PageGraphProvider: приложения на разных наборах UI');
    }
  }

  kinds(): GraphKinds {
    return PAGE_KINDS;
  }

  contribute(): GraphContribution {
    const nodes: GraphNodeInput[] = [];
    const edges: GraphEdgeInput[] = [];
    for (const spec of this.spec.apps) {
      const app = new UiIds(spec.app.set).app(spec.app);
      nodes.push(...spec.routes.map((route) => this.node(app, route)));
      edges.push(
        ...spec.routes.flatMap((route) => this.opens(spec, app, route)),
      );
    }
    return { nodes, edges };
  }

  rules(): readonly GraphRule[] {
    return [
      new RouteEntryRule(),
      new EntryRouteRule(
        this.spec.apps.map(({ app }) => new UiIds(app.set).app(app)),
      ),
      new RoutePathRule(),
      new RouteOverlapRule(),
      new RouteParamsRule(),
      new RouteCommonRule(),
      new ScreenUrlRule(),
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

  /** Ребро `opens` — только если приложение объявило вход `route.entry` (свой ключ `entries`). */
  private opens(
    spec: PageAppSpec,
    app: string,
    route: AnyPageRouteDef,
  ): GraphEdgeInput[] {
    if (!Object.hasOwn(spec.app.entries, route.entry)) return [];
    const entry = spec.app.entries[route.entry];
    if (entry === undefined) return [];
    return [
      {
        kind: PAGE_EDGE_KINDS.opens,
        from: `${app}/${route.name}`,
        to: new UiIds(spec.app.set).screen(entry.address.screen),
      },
    ];
  }
}
