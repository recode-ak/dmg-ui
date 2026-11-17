import type {
  GraphContribution,
  GraphKinds,
  GraphProvider,
} from 'dmg-core/graph';
import { UiIds } from 'dmg-ui';
import { UI_EDGE_KINDS } from 'dmg-ui/graph';
import { DIALOG_CHANNEL, DIALOG_VERSION } from './dialog-channel.const';
import type { DialogGraphSpec } from './dialog-graph-provider.types';

export type { DialogGraphSpec } from './dialog-graph-provider.types';

/**
 * Второй поставщик графа — диалоговый канал: ребро `presents` от приложения
 * UI к каждому экрану и уведомлению с представлением в `ChatViews`.
 * Своих видов и правил нет (ARC-13: префикс правил не нужен).
 */
export class DialogGraphProvider implements GraphProvider {
  readonly name = DIALOG_CHANNEL;
  readonly version = DIALOG_VERSION;

  constructor(private readonly spec: DialogGraphSpec) {}

  kinds(): GraphKinds {
    return { nodes: [], edges: [] };
  }

  contribute(): GraphContribution {
    const from = new UiIds(this.spec.app.set).app(this.spec.app);
    return {
      nodes: [],
      edges: this.spec.views.presented().map((to) => ({
        kind: UI_EDGE_KINDS.presents,
        from,
        to,
      })),
    };
  }
}
