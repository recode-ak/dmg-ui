import type { FieldIssue } from 'dmg-ui';
import type {
  PageRegionPresenter,
  PageTextTarget,
} from './page-region-presenter.types';
import { PAGE_TEXTS, PageRenderer } from './page-renderer';
import type { PageViewState } from './page-view-state.types';
import type { PageViews } from './page-views';
import type { ViewSource } from './view-source.types';

/**
 * Текстовое представление области поверх источника состояния: заметка, тело
 * по статусу, замечания формы, подтверждение — через пустую строку. Тело:
 * `loading` — «Загрузка…», `ready` и `refused` — вид (при перечитывании —
 * «Обновляется…» перед ним), `empty` — ничего (D-UI-70).
 */
export class PageTextPresenter implements PageRegionPresenter<PageTextTarget> {
  private readonly renderer: PageRenderer;

  constructor(views: PageViews) {
    this.renderer = new PageRenderer(views);
  }

  show(source: ViewSource<PageViewState>, target: PageTextTarget): () => void {
    return source.subscribe((state) => target.write(this.text(state)));
  }

  /** Текст области по состоянию; пустые части опускаются. */
  private text(state: PageViewState): string {
    const { note, issues, confirm } = state;
    return [
      note,
      ...this.body(state),
      ...issues.map(PageTextPresenter.issue),
      confirm === undefined
        ? undefined
        : `${confirm.label}\n${confirm.description}\n  [${PAGE_TEXTS.confirm}]`,
    ]
      .filter((part) => part !== undefined && part !== '')
      .join('\n\n');
  }

  private body(state: PageViewState): readonly (string | undefined)[] {
    switch (state.status) {
      case 'empty':
        return [];
      case 'loading':
        return [PAGE_TEXTS.loading];
      case 'ready':
      case 'refused':
        return [
          state.refreshing ? PAGE_TEXTS.refreshing : undefined,
          state.view === undefined
            ? undefined
            : this.renderer.screen(state.view),
        ];
      default:
        return PageTextPresenter.unknown(state.status);
    }
  }

  private static issue(issue: FieldIssue): string {
    return issue.field === undefined
      ? `! ${issue.text}`
      : `! ${issue.field}: ${issue.text}`;
  }

  /** Статус, которого не знает `switch`, — дефект канала, бросок (ERR-06). */
  private static unknown(status: never): never {
    throw new Error(
      `PageTextPresenter: неизвестный статус ${JSON.stringify(status)}`,
    );
  }
}
