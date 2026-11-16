import { CoreErrors, type DomainError, err, ok, type Result } from 'dmg-core';
import { DefIndex } from 'dmg-core/graph';
import { UiIds } from '../address/ui-ids';
import type { ScreenAction } from '../manifest/screen-action';
import type { ChannelNode } from './server.types';
import type { RouteNode, UcRoute, UcRoutesSpec } from './uc-routes.types';

export type { RouteNode, UcRoute, UcRoutesSpec } from './uc-routes.types';

/**
 * Маршруты UC стороны вызова: пара `(module, uc)` → Def в объединении
 * объявленного её узлами, модуль — по `DefIndex`. Сессии открыты экраны и
 * узлы канала, уведомителю — уведомления. Один UC из разных узлов — один
 * маршрут. Одноимённые UC одного модуля, UC вне приложения и повтор `id`
 * узла — ошибки сборки, бросок.
 */
export class UcRoutes {
  /** Маршруты по имени модуля, затем по имени UC. */
  private readonly modules = new Map<string, Map<string, UcRoute>>();
  private readonly ids = new Set<string>();
  private readonly spec: UcRoutesSpec;

  private constructor(spec: UcRoutesSpec, nodes: readonly RouteNode[]) {
    this.spec = spec;
    const index = DefIndex.from(spec.set.app.modules);
    for (const node of nodes) this.add(index, node);
  }

  /** Для сессии: `reads ∪ actions[].uc` экранов и `uses` узлов канала. */
  static forSession(
    spec: UcRoutesSpec,
    channel: readonly ChannelNode[],
  ): UcRoutes {
    const ids = new UiIds(spec.set);
    const screens = spec.set.modules.flatMap((module) =>
      module.screens.map((screen) => ({
        id: ids.screen(screen),
        uses: [
          ...screen.reads,
          ...Object.values<ScreenAction>(screen.actions).flatMap(
            (action) => action.uc ?? [],
          ),
        ],
      })),
    );
    return new UcRoutes(spec, [...screens, ...channel]);
  }

  /** Для уведомителя: `reads` уведомлений набора. */
  static forNotifications(spec: UcRoutesSpec): UcRoutes {
    const ids = new UiIds(spec.set);
    const notifications = spec.set.modules.flatMap((module) =>
      (module.notifications ?? []).map((def) => ({
        id: ids.notification(def),
        uses: def.reads,
      })),
    );
    return new UcRoutes(spec, notifications);
  }

  /** Маршрут вызова из недоверенного JSON; не объявлено — отказ и `warn`. */
  route(module: string, uc: string): Result<UcRoute, DomainError> {
    // Карта строится только из объявленного узлами: пары вне него нет,
    // отдельная сверка `DeclaredSet` была бы тавтологией.
    const route = this.modules.get(module)?.get(uc);
    return route === undefined ? this.refuse(module, uc) : ok(route);
  }

  private refuse(module: string, uc: string): Result<UcRoute, DomainError> {
    this.spec.logger.warn(this.spec.source, 'вызов UC вне объявленного', {
      module,
      uc,
    });
    return err(CoreErrors.OPERATION_NOT_FOUND.make({ module, uc }));
  }

  private add(index: DefIndex, { id, uses }: RouteNode): void {
    if (this.ids.has(id)) {
      throw new Error(`UcRoutes: повтор узла ${id}`);
    }
    this.ids.add(id);
    for (const uc of uses) {
      const module = index.moduleOf(uc);
      if (module === undefined) {
        throw new Error(`UcRoutes: UC ${uc.name} узла ${id} вне приложения`);
      }
      const byName =
        this.modules.get(module.name) ?? new Map<string, UcRoute>();
      const known = byName.get(uc.name);
      if (known !== undefined && known.uc !== uc) {
        throw new Error(
          `UcRoutes: в модуле ${module.name} два UC с именем ${uc.name}`,
        );
      }
      byName.set(uc.name, { uc, module });
      this.modules.set(module.name, byName);
    }
  }
}
