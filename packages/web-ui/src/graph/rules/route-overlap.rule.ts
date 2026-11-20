import type { Graph, GraphRule } from 'dmg-core/graph';
import { PagePath } from '../../url/page-path';
import { PageGraphReader } from '../page-graph-reader';

/**
 * PG-04: маршруты одного приложения не совпадают на одном URL (шаблоны
 * пересекаются, в том числе равные пути). Маршрут с невалидным шаблоном
 * пропускается — его называет PG-03. Строка на каждую пару; не бросает.
 */
export class RouteOverlapRule implements GraphRule {
  readonly id = 'PG-04';

  check(graph: Graph): readonly string[] {
    const valid = new PageGraphReader(graph).routes().flatMap((route) => {
      const path = PagePath.read(route.path);
      return path.ok ? [{ route, path: path.value }] : [];
    });
    return valid.flatMap((first, index) =>
      valid
        .slice(index + 1)
        .filter(
          (second) =>
            second.route.app === first.route.app &&
            first.path.overlaps(second.path),
        )
        .map(
          (second) =>
            `приложение ${first.route.app}: маршруты ${first.route.id} и ${second.route.id} совпадают на одном URL: ${first.route.path} и ${second.route.path}`,
        ),
    );
  }
}
