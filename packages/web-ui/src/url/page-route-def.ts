import { Def } from 'dmg-core';
import type {
  NormalizedPageRoute,
  PageRouteSpec,
} from './page-route-def.types';

export type {
  AnyPageRouteDef,
  NormalizedPageRoute,
  PageRouteSpec,
} from './page-route-def.types';

/**
 * Манифест маршрута страничного канала: вид Def, добавленный снаружи ядра
 * (образец — `ScreenDef` из `dmg-core/testing/example/screen`). Маршрут
 * сопоставляет путь странице — входу приложения UI.
 */
export class PageRouteDef<N extends string = string> extends Def<N> {
  readonly dmg = 'pageRoute';
  readonly path: string;
  readonly entry: string;

  constructor(spec: PageRouteSpec<N>) {
    super(spec);
    this.path = spec.path;
    this.entry = spec.entry;
  }

  static define<const N extends string>(
    spec: PageRouteSpec<N>,
  ): PageRouteDef<N> {
    return new PageRouteDef<N>(spec);
  }

  normalize(): NormalizedPageRoute {
    return {
      dmg: this.dmg,
      ...this.texts(),
      visible: this.visible,
      path: this.path,
      entry: this.entry,
    };
  }
}
