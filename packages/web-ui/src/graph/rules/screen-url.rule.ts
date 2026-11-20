import type { Graph, GraphRule } from 'dmg-core/graph';
import { PageParams } from '../../url/page-params';
import { PagePath } from '../../url/page-path';
import { PageGraphReader } from '../page-graph-reader';

/**
 * PG-07: экран набора выражается в URL — имена модуля и экрана годятся для
 * общего пути, параметры — строка, целое или булево. Тексты причин — из
 * `PagePath.common` и `PageParams.read`; по экрану набора, не по приложению;
 * не бросает.
 */
export class ScreenUrlRule implements GraphRule {
  readonly id = 'PG-07';

  check(graph: Graph): readonly string[] {
    return new PageGraphReader(graph).screens().flatMap((screen) => {
      const common = PagePath.common(screen.id, screen.module, screen.name);
      const params = PageParams.read(screen.id, screen.params);
      return [
        ...(common.ok ? [] : [common.error]),
        ...(params.ok ? [] : params.error),
      ];
    });
  }
}
