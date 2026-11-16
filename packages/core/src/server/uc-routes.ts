import {
  type AnyUseCaseDef,
  CoreErrors,
  type DomainError,
  err,
  ok,
  type Result,
} from 'dmg-core';
import { DefIndex } from 'dmg-core/graph';
import { UiIds } from '../address/ui-ids';
import type { ScreenAction } from '../manifest/screen-action';
import type { UcRoute, UcRoutesSpec } from './uc-routes.types';

export type { UcRoute, UcRoutesSpec } from './uc-routes.types';

/**
 * Маршруты UC узлов сервера: имя UC → Def только внутри объявленного узлом
 * (`reads ∪ actions[].uc` экрана, `reads` уведомления, `uses` узла канала),
 * модуль — по `DefIndex`. Одноимённые UC в узле, UC вне приложения и
 * повтор `id` узла — ошибки сборки, бросок.
 */
export class UcRoutes {
  private readonly nodes = new Map<string, ReadonlyMap<string, UcRoute>>();
  private readonly spec: UcRoutesSpec;

  constructor(spec: UcRoutesSpec) {
    this.spec = spec;
    const { set } = spec;
    const ids = new UiIds(set);
    const index = DefIndex.from(set.app.modules);
    for (const module of set.modules) {
      for (const screen of module.screens) {
        const calls = Object.values<ScreenAction>(screen.actions).flatMap(
          (action) => action.uc ?? [],
        );
        this.add(index, ids.screen(screen), [...screen.reads, ...calls]);
      }
      for (const notification of module.notifications ?? []) {
        this.add(index, ids.notification(notification), notification.reads);
      }
    }
    for (const node of spec.nodes) this.add(index, node.id, node.uses);
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

  private add(
    index: DefIndex,
    node: string,
    ucs: readonly AnyUseCaseDef[],
  ): void {
    if (this.nodes.has(node)) {
      throw new Error(`UcRoutes: повтор узла ${node}`);
    }
    const byName = new Map<string, UcRoute>();
    for (const uc of ucs) {
      const known = byName.get(uc.name);
      if (known !== undefined && known.uc !== uc) {
        throw new Error(`UcRoutes: в узле ${node} два UC с именем ${uc.name}`);
      }
      const module = index.moduleOf(uc);
      if (module === undefined) {
        throw new Error(`UcRoutes: UC ${uc.name} узла ${node} вне приложения`);
      }
      byName.set(uc.name, { uc, module });
    }
    this.nodes.set(node, byName);
  }
}
