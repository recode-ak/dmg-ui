import type { Graph, GraphRule } from 'dmg-core/graph';
import { PagePath } from '../url/page-path';
import { PageGraphReader } from './page-graph-reader';

/** PG-03: шаблон пути маршрута — по синтаксису (причина — из `PagePath.read`); не бросает. */
export class RoutePathRule implements GraphRule {
  readonly id = 'PG-03';

  check(graph: Graph): readonly string[] {
    return new PageGraphReader(graph).routes().flatMap((route) => {
      const path = PagePath.read(route.path);
      return path.ok ? [] : [`маршрут ${route.id}: ${path.error}`];
    });
  }
}
