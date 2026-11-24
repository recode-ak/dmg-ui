import {
  type GraphContribution,
  GraphError,
  type GraphKinds,
  type GraphProvider,
  type GraphRule,
  type SourceLayer,
} from 'dmg-core/graph';
import { UiIds } from '../address/ui-ids';
import { UiEdges } from './ui-edges';
import type { UiGraphSpec } from './ui-graph-provider.types';
import { UI_KINDS, UI_PROVIDER, UI_VERSION } from './ui-kinds';
import { UiLayers } from './ui-layers';
import { UiNodes } from './ui-nodes';
import { UiRules } from './ui-rules';

/**
 * Поставщик графа ядра UI: узлы и рёбра набора UI и его приложений UI, слои
 * фронта для `arch:check`. Один поставщик на набор: имя `dmg-ui` уникально в
 * графе.
 */
export class UiGraphProvider implements GraphProvider {
  readonly name = UI_PROVIDER;
  readonly version = UI_VERSION;

  // Слои — в конструкторе: имя модуля или канала, занятое слоем, — отказ
  // сборки поставщика, до проверки архитектуры.
  private readonly frontLayers: UiLayers;

  constructor(private readonly spec: UiGraphSpec) {
    this.frontLayers = new UiLayers(spec.set, spec.channels);
  }

  kinds(): GraphKinds {
    return UI_KINDS;
  }

  /**
   * Повтор `id` в наборе поднимается как `GraphError`: проверка архитектуры
   * показывает «граф не собран», а не падает исключением.
   */
  contribute(): GraphContribution {
    const { set, apps } = this.spec;
    const ids = UiGraphProvider.idsOf(this.spec);
    return {
      nodes: new UiNodes(set, apps, ids).list(),
      edges: new UiEdges(set, apps, ids).list(),
    };
  }

  rules(): readonly GraphRule[] {
    return UiRules.of(this.spec.set);
  }

  layers(): readonly SourceLayer[] {
    return this.frontLayers.list();
  }

  private static idsOf(spec: UiGraphSpec): UiIds {
    try {
      return new UiIds(spec.set);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new GraphError('duplicate-node', message, { cause: error });
    }
  }
}
