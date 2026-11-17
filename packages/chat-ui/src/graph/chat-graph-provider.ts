import type {
  GraphContribution,
  GraphEdgeInput,
  GraphKinds,
  GraphNodeInput,
  GraphProvider,
} from 'dmg-core/graph';
import { UiIds } from 'dmg-ui';
import { UI_EDGE_KINDS } from 'dmg-ui/graph';
import * as v from 'valibot';
import { MessengerCapabilitiesSchema } from '../messenger/capabilities-schema';
import type { ChatAppSpec, ChatGraphSpec } from './chat-graph-provider.types';
import { ChatIds } from './chat-ids';
import {
  CHAT_EDGE_KINDS,
  CHAT_KINDS,
  CHAT_NODE_KINDS,
  CHAT_PROVIDER,
  CHAT_VERSION,
} from './chat-kinds';

export type { ChatAppSpec, ChatGraphSpec } from './chat-graph-provider.types';

/**
 * Поставщик графа общей части мессенджеров (D-UI-57) — один на все
 * приложения: под приложением UI узел возможностей `chatMessenger` и входы
 * беседы `chatEntry` с ребром `chatEnters`, рёбра `presents` — от реестра.
 * Повтор приложения, реестр другого набора, возможности не по схеме — бросок.
 */
export class ChatGraphProvider implements GraphProvider {
  readonly name = CHAT_PROVIDER;
  readonly version = CHAT_VERSION;

  constructor(private readonly spec: ChatGraphSpec) {
    const seen = new Set<string>();
    for (const { app, views, capabilities } of spec.apps) {
      if (seen.has(app.name)) {
        throw new Error(
          `ChatGraphProvider: приложение ${app.name} указано дважды`,
        );
      }
      seen.add(app.name);
      if (views.set !== app.set) {
        throw new Error(
          `ChatGraphProvider: реестр представлений приложения ${app.name} — не для набора приложения`,
        );
      }
      if (!v.is(MessengerCapabilitiesSchema, capabilities)) {
        throw new Error(
          `ChatGraphProvider: возможности мессенджера приложения ${app.name} не по схеме`,
        );
      }
    }
  }

  kinds(): GraphKinds {
    return CHAT_KINDS;
  }

  contribute(): GraphContribution {
    return {
      nodes: this.spec.apps.flatMap((spec) => this.nodes(spec)),
      edges: this.spec.apps.flatMap((spec) => this.edges(spec)),
    };
  }

  private nodes({ app, capabilities }: ChatAppSpec): GraphNodeInput[] {
    const ids = new ChatIds(app.set);
    return [
      {
        kind: CHAT_NODE_KINDS.messenger,
        id: ids.messenger(app),
        label: capabilities.name,
        description: `Мессенджер приложения ${app.name}.`,
        props: capabilities,
      },
      ...Object.entries(app.entries).map(([entry, spec]) => ({
        kind: CHAT_NODE_KINDS.entry,
        id: ids.entry(app, entry),
        label: spec.label,
        description: spec.description,
        props: { entry },
      })),
    ];
  }

  /** Рёбра `chatEnters` из Def приложения (`entries`), `presents` — из `presented()`. */
  private edges({ app, views }: ChatAppSpec): GraphEdgeInput[] {
    const ui = new UiIds(app.set);
    const ids = new ChatIds(app.set);
    const from = ui.app(app);
    return [
      ...Object.entries(app.entries).map(([entry, spec]) => ({
        kind: CHAT_EDGE_KINDS.enters,
        from: ids.entry(app, entry),
        to: ui.screen(spec.address.screen),
      })),
      ...views.presented().map((to) => ({
        kind: UI_EDGE_KINDS.presents,
        from,
        to,
      })),
    ];
  }
}
