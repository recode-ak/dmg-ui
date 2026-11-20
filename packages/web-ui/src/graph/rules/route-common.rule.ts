import type { Graph, GraphRule } from 'dmg-core/graph';
import { PagePath } from '../../url/page-path';
import { PageGraphReader } from '../page-graph-reader';

/**
 * PG-06: шаблон маршрута не пересекается с общим путём экрана набора
 * `/<модуль>/<экран>`. Строка на каждый экран. Пропускаются маршрут с
 * невалидным шаблоном (PG-03) и экран с именем не по форме (PG-07); не бросает.
 */
export class RouteCommonRule implements GraphRule {
  readonly id = 'PG-06';

  check(graph: Graph): readonly string[] {
    const reader = new PageGraphReader(graph);
    const screens = reader.screens();
    return reader.routes().flatMap((route) => {
      const path = PagePath.read(route.path);
      if (!path.ok) return [];
      return screens.flatMap((screen) => {
        const common = PagePath.common(screen.id, screen.module, screen.name);
        if (!common.ok) return [];
        if (path.value.match([screen.module, screen.name]) === undefined) {
          return [];
        }
        return [
          `маршрут ${route.id}: шаблон ${route.path} совпадает с общим путём экрана ${screen.id} (${common.value})`,
        ];
      });
    });
  }
}
