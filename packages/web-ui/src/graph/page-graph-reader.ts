import type { Graph } from 'dmg-core/graph';
import { UI_NODE_KINDS } from 'dmg-ui/graph';
import * as v from 'valibot';
import type { PageRouteNode, PageScreenNode } from './page-graph-reader.types';
import {
  PAGE_EDGE_KINDS,
  PAGE_NODE_KINDS,
  PAGE_ROUTE_PROPS,
} from './page-kinds';

/** Из свойств узла `screen` правилам нужны только параметры адреса. */
const SCREEN_PROPS = v.looseObject({
  params: v.record(v.string(), v.unknown()),
});

/**
 * Читатель графа для правил PG-03…PG-07: маршруты, экраны и ребро `opens`
 * в порядке узлов графа (канонический порядок платформы). Узел со свойствами не по схеме пропускается молча — его
 * называют PG-01 и правила `dmg-ui`; не бросает.
 */
export class PageGraphReader {
  constructor(private readonly graph: Graph) {}

  /** Маршруты страничного канала с валидными свойствами. */
  routes(): readonly PageRouteNode[] {
    const routes: PageRouteNode[] = [];
    for (const node of this.graph.nodes()) {
      if (node.kind !== PAGE_NODE_KINDS.route) continue;
      const props = v.safeParse(PAGE_ROUTE_PROPS, node.props);
      if (!props.success || node.parent === undefined) continue;
      routes.push({
        id: node.id,
        app: node.parent,
        path: props.output.path,
        entry: props.output.entry,
      });
    }
    return routes;
  }

  /** `id` цели ребра `opens` маршрута `routeId`; нет ребра — `undefined`. Что цель — экран, проверяет вызывающий. */
  opened(routeId: string): string | undefined {
    return this.graph.outgoing(routeId, PAGE_EDGE_KINDS.opens)[0]?.to;
  }

  /** Экраны набора с валидными параметрами; `id` — ровно `<набор>/<модуль>/<экран>`, иной узел `screen` пропускается. */
  screens(): readonly PageScreenNode[] {
    const screens: PageScreenNode[] = [];
    for (const node of this.graph.nodes()) {
      if (node.kind !== UI_NODE_KINDS.screen) continue;
      const props = v.safeParse(SCREEN_PROPS, node.props);
      const parts = node.id.split('/');
      const [, module, name] = parts;
      if (
        !props.success ||
        parts.length !== 3 ||
        module === undefined ||
        name === undefined
      ) {
        continue;
      }
      screens.push({
        id: node.id,
        module,
        name,
        params: props.output.params,
      });
    }
    return screens;
  }
}
