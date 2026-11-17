import { GraphId } from 'dmg-core/graph';
import { type AnyUiAppDef, type AnyUiSetDef, UiIds } from 'dmg-ui';

/**
 * `id` узлов поставщика `dmg-ui-chat` под узлом приложения UI: родитель —
 * `UiIds.app(app)`, сегменты проверяет `GraphId`; имя входа не по правилу
 * сегмента — бросок.
 */
export class ChatIds {
  private static readonly ENTRY = 'enter-';
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
    return this.under(app, `${ChatIds.ENTRY}${name}`);
  }

  /** Точка входа: `<app>/point-<вход>-<n>`, `n` — с 1 внутри входа. */
  point(app: AnyUiAppDef, entry: string, n: number): string {
    return this.under(app, `point-${entry}-${n}`);
  }

  /** Имя входа из `id` узла `chatEntry`; `id` не этой формы — он сам. */
  static entryName(id: string): string {
    const segment = id.slice(id.lastIndexOf('/') + 1);
    return segment.startsWith(ChatIds.ENTRY)
      ? segment.slice(ChatIds.ENTRY.length)
      : id;
  }

  private under(app: AnyUiAppDef, segment: string): string {
    return GraphId.parse(this.ids.app(app)).child(segment).toString();
  }
}
