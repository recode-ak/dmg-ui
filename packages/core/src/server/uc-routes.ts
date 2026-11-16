import { CoreErrors, type DomainError, err, ok, type Result } from 'dmg-core';
import { DefIndex } from 'dmg-core/graph';
import { UiIds } from '../address/ui-ids';
import type { ScreenAction } from '../manifest/screen-action';
import type { ChannelNode } from './server.types';
import type { RouteNode, UcRoute, UcRoutesSpec } from './uc-routes.types';

export type { RouteNode, UcRoute, UcRoutesSpec } from './uc-routes.types';

/**
 * Маршруты UC узлов сервера: имя UC → Def только внутри объявленного узлом,
 * модуль — по `DefIndex`. Сессии открыты экраны и узлы канала, уведомителю —
 * уведомления. Одноимённые UC в узле, UC вне приложения и повтор `id` —
 * ошибки сборки, бросок.
 */
export class UcRoutes {
  private readonly nodes = new Map<string, ReadonlyMap<string, UcRoute>>();
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
  route(node: string, uc: string): Result<UcRoute, DomainError> {
    // Карта узла строится только из его объявленного списка: имени вне
    // него нет, отдельная сверка `DeclaredSet` была бы тавтологией.
    const route = this.nodes.get(node)?.get(uc);
    return route === undefined ? this.refuse(node, uc) : ok(route);
  }

  private refuse(node: string, uc: string): Result<UcRoute, DomainError> {
    this.spec.logger.warn(this.spec.source, 'вызов UC вне объявленного узлом', {
      node,
      uc,
    });
    return err(CoreErrors.OPERATION_NOT_FOUND.make({ module: node, uc }));
  }

  private add(index: DefIndex, { id, uses }: RouteNode): void {
    if (this.nodes.has(id)) {
      throw new Error(`UcRoutes: повтор узла ${id}`);
    }
    const byName = new Map<string, UcRoute>();
    for (const uc of uses) {
      const known = byName.get(uc.name);
      if (known !== undefined && known.uc !== uc) {
        throw new Error(`UcRoutes: в узле ${id} два UC с именем ${uc.name}`);
      }
      const module = index.moduleOf(uc);
      if (module === undefined) {
        throw new Error(`UcRoutes: UC ${uc.name} узла ${id} вне приложения`);
      }
      byName.set(uc.name, { uc, module });
    }
    this.nodes.set(id, byName);
  }
}
