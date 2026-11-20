import type { AnyEventDef, AnyUseCaseDef } from 'dmg-core';
import {
  DomainIds,
  type GraphContribution,
  type GraphEdgeInput,
  type GraphKinds,
  type GraphProvider,
} from 'dmg-core/graph';
import { UiIds } from '../src/address/ui-ids';
import type { AnyNotificationDef } from '../src/manifest/notification-def.types';
import type { AnyScreenDef } from '../src/manifest/screen-def.types';
import type { AnyUiAppDef } from '../src/manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../src/manifest/ui-set-def.types';

// Тестовые поставщики канала для правил графа (в `testing/index.ts` не
// экспортируются). Правил у них нет: префиксы чужих правил не нужны. Рёбра
// `presents`, `notifiedBy`, `invokes`, `reads` — виды ядра `dmg-ui`: элемент
// чужого вида вправе ставить любой поставщик.

/** Что приложение UI показывает: экран, уведомление или набор целиком. */
export type Presented = AnyScreenDef | AnyNotificationDef | AnyUiSetDef;

/** Поставщик представления: рёбра `presents` от приложения UI (или узла под ним) к списку целей. */
export class StubViewProvider implements GraphProvider {
  readonly name = 'stub-view';
  readonly version = '1.0.0';
  private readonly ids: UiIds;

  /** `from` — `id` узла под приложением UI; без него — само приложение. */
  constructor(
    set: AnyUiSetDef,
    private readonly app: AnyUiAppDef,
    private readonly targets: readonly Presented[],
    private readonly from?: string,
  ) {
    this.ids = new UiIds(set);
  }

  kinds(): GraphKinds {
    return { nodes: [], edges: [] };
  }

  contribute(): GraphContribution {
    const from = this.from ?? this.ids.app(this.app);
    return {
      nodes: [],
      edges: this.targets.map((target) => ({
        kind: 'presents',
        from,
        to: this.idOf(target),
      })),
    };
  }

  private idOf(target: Presented): string {
    switch (target.dmg) {
      case 'screen':
        return this.ids.screen(target);
      case 'notification':
        return this.ids.notification(target);
      case 'uiSet':
        return this.ids.set();
    }
  }
}

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
  /** `id` узла: под приложением UI, годится как `from` у `StubViewProvider`. */
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
