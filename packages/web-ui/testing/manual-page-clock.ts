import type { PageClock } from 'dmg-ui/web-ui';

/** Отложенный вызов: срок по часам и номер постановки — для порядка при равных сроках. */
type Planned = {
  readonly at: number;
  readonly order: number;
  readonly run: () => void;
};

/**
 * Подставные часы для тестов без таймеров среды (TST-04): время стоит, пока
 * тест не сдвинет его `advance`. Единицы — мс; отрицательный срок `after` —
 * как нулевой. `pending()` — через сколько мс исполнится каждый ждущий вызов,
 * по возрастанию.
 */
export class ManualPageClock implements PageClock {
  private time: number;
  private planned: Planned[] = [];
  private orders = 0;

  constructor(start = 0) {
    this.time = start;
  }

  now(): number {
    return this.time;
  }

  after(ms: number, run: () => void): () => void {
    this.orders += 1;
    const planned: Planned = {
      at: this.time + Math.max(0, ms),
      order: this.orders,
      run,
    };
    this.planned.push(planned);
    return () => {
      this.planned = this.planned.filter((p) => p !== planned);
    };
  }

  /**
   * Сдвиг времени: вызовы со сроком до нового времени — по порядку срока, при
   * равном — по порядку постановки, включая поставленные во время сдвига; к
   * вызову время уже равно его сроку. Отрицательный сдвиг — часы назад,
   * ничего не исполняется.
   */
  advance(ms: number): void {
    const target = this.time + ms;
    for (;;) {
      const next = this.due(target);
      if (next === undefined) break;
      this.planned = this.planned.filter((p) => p !== next);
      this.time = next.at;
      next.run();
    }
    this.time = target;
  }

  /** Сроки ждущих вызовов — через сколько мс от `now()`, по возрастанию. */
  pending(): readonly number[] {
    return this.planned.map((p) => p.at - this.time).sort((a, b) => a - b);
  }

  /** Самый ранний вызов со сроком не позже `target`. */
  private due(target: number): Planned | undefined {
    let first: Planned | undefined;
    for (const planned of this.planned) {
      if (planned.at > target) continue;
      if (
        first === undefined ||
        planned.at < first.at ||
        (planned.at === first.at && planned.order < first.order)
      ) {
        first = planned;
      }
    }
    return first;
  }
}
