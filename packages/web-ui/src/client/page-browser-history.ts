import type {
  PageBrowserWindow,
  PageHistoryEntry,
  PageHistoryPort,
} from './page-history.types';

/**
 * Порт истории поверх History API окна (D-UI-81). Окно — узкий тип: его
 * передаёт привязка вкладки, типов DOM пакет не подключает. URL записи —
 * путь и строка запроса: фрагмент-переход даёт запись без нашей записи, она
 * читается по URL. Броски `pushState`/`replaceState` — вызывающему.
 * @see ./page-browser-history.test.ts
 */
export class PageBrowserHistory implements PageHistoryPort {
  constructor(private readonly browser: PageBrowserWindow) {}

  current(): PageHistoryEntry {
    const { pathname, search } = this.browser.location;
    return { url: `${pathname}${search}`, record: this.browser.history.state };
  }

  push(url: string, record: string): void {
    this.browser.history.pushState(record, '', url);
  }

  replace(url: string, record: string): void {
    this.browser.history.replaceState(record, '', url);
  }

  onTraverse(handler: (entry: PageHistoryEntry) => Promise<void> | void): void {
    this.browser.addEventListener('popstate', () => {
      void handler(this.current());
    });
  }
}
