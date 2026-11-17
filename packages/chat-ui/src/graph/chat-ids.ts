import { GraphId } from 'dmg-core/graph';
import { type AnyUiAppDef, type AnyUiSetDef, UiIds } from 'dmg-ui';

/**
 * `id` узлов поставщика `dmg-ui-chat` под узлом приложения UI: родитель —
 * `UiIds.app(app)`, сегменты проверяет `GraphId`; имя входа не по правилу
 * сегмента — бросок.
 */
export class ChatIds {
  private readonly ids: UiIds;

  constructor(set: AnyUiSetDef) {
    this.ids = new UiIds(set);
  }

  /** Мессенджер приложения: `<app>/messenger`. */
  messenger(app: AnyUiAppDef): string {
    return this.under(app, 'messenger');
  }

  /** Вход беседы: `<app>/enter-<имя входа>`. */
  entry(app: AnyUiAppDef, name: string): string {
    return this.under(app, `enter-${name}`);
  }

  private under(app: AnyUiAppDef, segment: string): string {
    return GraphId.parse(this.ids.app(app)).child(segment).toString();
  }
}
