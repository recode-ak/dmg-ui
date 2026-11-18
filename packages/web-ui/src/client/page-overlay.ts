import { err, type Result } from 'dmg-core';
import type { InstanceView } from 'dmg-ui';
import { PAGE_CHANNEL } from '../page-channel.const';
import type {
  PageExpected,
  PageViewState,
} from '../view/page-view-state.types';
import type { ViewSource } from '../view/view-source.types';
import { PAGE_FAULTS } from './page-client.const';
import type { PageOverlayCheck, PageOverlayEntry } from './page-overlay.types';
import { ViewCell } from './view-cell';

/**
 * Производный источник области: ожидаемые итоги действий поверх её вида
 * (D-UI-84). Без живых наложений отдаёт тот же объект, что источник; с
 * наложениями — `view.data` из итогов по порядку постановки, `expected: true`,
 * прочее — от источника. Наложение живо, пока область готова той же ревизии
 * без пометки устаревания и `holds()` истинно; умершее не оживает.
 * @see ./page-overlay.test.ts
 */
export class PageOverlay implements ViewSource<PageViewState> {
  private readonly cell: ViewCell<PageViewState>;
  /** Живые наложения по порядку постановки. */
  private readonly entries = new Set<PageOverlayEntry>();

  constructor(
    private readonly base: ViewSource<PageViewState>,
    private readonly check: PageOverlayCheck,
    private readonly onFault: (node: string, error: unknown) => void,
  ) {
    const cell: ViewCell<PageViewState> = new ViewCell(base.get(), (error) =>
      onFault(cell.get().address?.screen ?? PAGE_CHANNEL, error),
    );
    this.cell = cell;
    base.subscribe(() => this.refresh());
  }

  get(): PageViewState {
    return this.cell.get();
  }

  subscribe(listener: (value: PageViewState) => void): () => void {
    return this.cell.subscribe(listener);
  }

  /** Наложить итог на вид ревизии `revision`, пока `holds()`; возвращает снятие (повтор — без действия). */
  put(
    revision: number,
    expected: PageExpected,
    holds: () => boolean,
  ): () => void {
    const entry: PageOverlayEntry = { revision, expected, holds };
    this.entries.add(entry);
    this.refresh();
    return () => {
      if (this.entries.delete(entry)) this.refresh();
    };
  }

  /** Есть живое наложение. */
  expecting(): boolean {
    return this.entries.size > 0;
  }

  /** Пересчёт значения: мёртвые наложения удалены навсегда, живые свёрнуты по порядку. */
  private refresh(): void {
    const base = this.base.get();
    // Вернувшаяся ревизия или связь мёртвое наложение не оживляет: за это
    // время вид мог уйти от данных, по которым посчитан итог.
    for (const entry of this.entries) {
      if (!PageOverlay.alive(entry, base)) this.entries.delete(entry);
    }
    const view = base.view;
    if (view === undefined || this.entries.size === 0) {
      this.cell.set(base);
      return;
    }
    let data = view.data;
    for (const entry of this.entries) {
      const next = this.apply(entry, { ...view, data });
      if (next.ok) data = next.value;
      else this.entries.delete(entry);
    }
    this.cell.set(
      this.entries.size === 0
        ? base
        : { ...base, view: { ...view, data }, expected: true },
    );
  }

  /**
   * Итог одного наложения. В вид идёт выход проверки, а не итог функции:
   * представление приводит данные к типу экрана без проверки. Отказ проверки
   * и бросок функции — сбой фиксированным текстом, без итога и броска.
   */
  private apply(
    entry: PageOverlayEntry,
    view: InstanceView,
  ): Result<unknown, void> {
    try {
      const checked = this.check(view, entry.expected(view));
      if (checked.ok) return checked;
    } catch {
      // Бросок функции итога — дефект представления, ниже тот же сбой.
    }
    this.onFault(view.screen, new Error(PAGE_FAULTS.expected));
    return err(undefined);
  }

  private static alive(entry: PageOverlayEntry, base: PageViewState): boolean {
    return (
      base.status === 'ready' &&
      base.stale === undefined &&
      base.view?.revision === entry.revision &&
      entry.holds()
    );
  }
}
