import type { AnyEventDef, AnyUseCaseDef } from 'dmg-core';
import {
  DomainIds,
  type GraphContribution,
  type GraphEdgeInput,
  type GraphKinds,
  type GraphProvider,
} from 'dmg-core/graph';
import { UiIds } from '../src/address/ui-ids';
import type { AnyUiAppDef } from '../src/manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../src/manifest/ui-set-def.types';

// Тестовые поставщики канала для правил графа (в `testing/index.ts` не
// экспортируются). Правил у них нет: префиксы чужих правил не нужны. Рёбра
// `notifiedBy`, `invokes`, `reads` — виды ядра `dmg-ui`: элемент чужого вида
// вправе ставить любой поставщик.

/** Что сигнал канала делает: событие и вызовы UC (любой из трёх может отсутствовать). */
export type SignalSpec = {
  readonly event?: AnyEventDef;
  readonly invokes?: AnyUseCaseDef;
  readonly reads?: AnyUseCaseDef;
};

/** Узел канала `signal` под приложением UI: привязан к событию и вызывает UC. */
export class StubSignalProvider implements GraphProvider {
  readonly name = 'stub-signal';
  readonly version = '1.0.0';
  /** `id` узла — под приложением UI. */
  readonly nodeId: string;
  private readonly domain: DomainIds;

  constructor(
    set: AnyUiSetDef,
    app: AnyUiAppDef,
    private readonly spec: SignalSpec,
  ) {
    this.nodeId = `${new UiIds(set).app(app)}/signal`;
    this.domain = new DomainIds(set.app);
  }

  kinds(): GraphKinds {
    return {
      nodes: [
        {
          kind: 'signal',
          label: 'Сигнал канала',
          description: 'Узел канала для проверки правил: событие и вызов UC.',
        },
      ],
      edges: [],
    };
  }

  contribute(): GraphContribution {
    const { event, invokes, reads } = this.spec;
    const edges: GraphEdgeInput[] = [];
    if (event) {
      edges.push(this.edge('notifiedBy', this.domain.event(event)));
    }
    if (invokes) {
      edges.push(this.edge('invokes', this.domain.operation(invokes)));
    }
    if (reads) {
      edges.push(this.edge('reads', this.domain.operation(reads)));
    }
    return {
      nodes: [
        {
          kind: 'signal',
          id: this.nodeId,
          label: 'Сигнал',
          description: 'Узел канала, привязанный к событию.',
        },
      ],
      edges,
    };
  }

  private edge(kind: string, to: string): GraphEdgeInput {
    return { kind, from: this.nodeId, to };
  }
}
