import { PageTextPresenter } from '../view/page-text-presenter';
import type { PageViews } from '../view/page-views';
import type { PageClient } from './page-client';
import { PAGE_NOTES } from './page-client.const';
import type { PageRegionName } from './page-client.types';

const REGIONS: readonly PageRegionName[] = ['main', 'side'];

/**
 * Текстовая страница вкладки — для тестов, она же подставная цель показа:
 * текстовое представление на `main` и `side`, склейка областей через `---`
 * и входящие вкладки. После `close()` тексты областей не меняются.
 */
export class PageText {
  private readonly texts: Record<PageRegionName, string> = {
    main: '',
    side: '',
  };
  private readonly offs: readonly (() => void)[];

  constructor(
    private readonly client: PageClient,
    views: PageViews,
  ) {
    const presenter = new PageTextPresenter(views);
    this.offs = REGIONS.map((name) =>
      presenter.show(client.source(name), {
        write: (text) => {
          this.texts[name] = text;
        },
      }),
    );
  }

  /** Текст области; пустая — `''`. */
  region(name: PageRegionName): string {
    return this.texts[name];
  }

  /** Текст страницы: обе области и входящие; пустые части опускаются. */
  page(): string {
    return [...REGIONS.map((name) => this.texts[name]), this.inbox()]
      .filter((part) => part !== '')
      .join('\n\n---\n\n');
  }

  close(): void {
    for (const off of this.offs) off();
  }

  private inbox(): string {
    const entries = this.client.inbox;
    if (entries.length === 0) return '';
    return [
      PAGE_NOTES.inbox,
      ...entries.map((entry) => `- ${entry.text}`),
    ].join('\n');
  }
}
