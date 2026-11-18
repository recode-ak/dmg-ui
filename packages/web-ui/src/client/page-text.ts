import { PageTextPresenter } from '../view/page-text-presenter';
import type { PageViews } from '../view/page-views';
import type { PageClient } from './page-client';
import { PAGE_NOTES, PAGE_REGIONS } from './page-client.const';
import type { PageRegionName } from './page-client.types';

/**
 * Текстовая страница вкладки — для тестов, она же подставная цель показа:
 * текстовое представление на каждой области, склейка областей через `---`
 * и входящие вкладки текстом представлений уведомлений. После `close()`
 * тексты областей не меняются.
 */
export class PageText {
  private readonly texts = new Map<PageRegionName, string>(
    PAGE_REGIONS.map((name) => [name, '']),
  );
  private readonly offs: readonly (() => void)[];

  constructor(
    private readonly client: PageClient,
    private readonly views: PageViews,
  ) {
    const presenter = new PageTextPresenter(views);
    this.offs = PAGE_REGIONS.map((name) =>
      presenter.show(client.source(name), {
        write: (text) => {
          this.texts.set(name, text);
        },
      }),
    );
  }

  /** Текст области; пустая — `''`. */
  region(name: PageRegionName): string {
    return this.texts.get(name) ?? '';
  }

  /** Текст страницы: области по порядку и входящие; пустые части опускаются. */
  page(): string {
    return [...PAGE_REGIONS.map((name) => this.region(name)), this.inbox()]
      .filter((part) => part !== '')
      .join('\n\n---\n\n');
  }

  close(): void {
    for (const off of this.offs) off();
  }

  /** Текст записи — у представления её уведомления; нет представления — бросок, как у экрана. */
  private inbox(): string {
    const entries = this.client.inbox().get();
    if (entries.length === 0) return '';
    return [
      PAGE_NOTES.inbox,
      ...entries.map(
        (entry) =>
          `- ${this.views.notification(entry.notification).text(entry.data)}`,
      ),
    ].join('\n');
  }
}
