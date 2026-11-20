import type { Graph, GraphRule } from 'dmg-core/graph';
import { PageParams } from '../../url/page-params';
import { PagePath } from '../../url/page-path';
import { PageGraphReader } from '../page-graph-reader';

/**
 * PG-05: каждый параметр пути маршрута объявлен экраном входа (остальные
 * параметры экрана идут строкой запроса). Пропускаются: маршрут с
 * невалидным шаблоном (PG-03), без ребра `opens` (PG-01), экран с
 * замечаниями о параметрах (PG-07); не бросает.
 */
export class RouteParamsRule implements GraphRule {
  readonly id = 'PG-05';

  check(graph: Graph): readonly string[] {
    const reader = new PageGraphReader(graph);
    const screens = new Map(
      reader.screens().map((screen) => [screen.id, screen]),
    );
    return reader.routes().flatMap((route) => {
      const path = PagePath.read(route.path);
      const opened = reader.opened(route.id);
      const screen = opened === undefined ? undefined : screens.get(opened);
      if (!path.ok || screen === undefined) return [];
      const params = PageParams.read(screen.id, screen.params);
      if (!params.ok) return [];
      return path.value
        .names()
        .filter((name) => !params.value.has(name))
        .map(
          (name) =>
            `маршрут ${route.id}: параметр пути ${name} не объявлен экраном входа ${screen.id}`,
        );
    });
  }
}
