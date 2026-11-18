import type { PageSnapshot } from './page-client.types';
import type { PageHistoryPage, PageHistoryPort } from './page-history.types';
import { PageHistoryRecord } from './page-history-record';

/**
 * Правило записей истории поверх порта (D-UI-81). Шаг начинает клиент там,
 * где начинается переход: первое изменение адресов против адресов на начало
 * шага — `push`, всё следующее до его конца — замена той же записи. Иначе
 * запись заменяется при изменении адресов или состояния — не пока область
 * грузится, не без ссылки и не во время перехода по записи.
 * @see ./page-history.test.ts
 */
export class PageHistory {
  /** Ключ отсева последнего записанного: адреса и снимок без ревизий. */
  private written: string | undefined;
  /** Идущие шаги. */
  private active = 0;
  /** Идущие шаги, ещё не давшие записи. */
  private unrecorded = 0;
  /** Адреса, против которых шаг без записи ищет изменение: на начало шага или последней записи. */
  private base: string | undefined;
  /** Поколение последнего начатого перехода по записи. */
  private generation = 0;
  /**
   * Поколение перехода, который держит блок замен. Блок принадлежит
   * последнему переходу: вытесненный ранний его не держит и не снимает.
   */
  private blocking: number | undefined;

  constructor(
    private readonly port: PageHistoryPort,
    private readonly page: PageHistoryPage,
    private readonly onFault: () => void,
  ) {}

  /** Новое значение какой-то области: запись шага, замена текущей или ничего. */
  changed(): void {
    const url = this.page.url();
    // Без ссылки прежний URL с новым снимком не пишется: запись разошлась бы
    // с адресной строкой.
    if (url === undefined) return;
    const places = JSON.stringify(this.page.places());
    if (
      this.unrecorded > 0 &&
      this.base !== undefined &&
      PageHistory.isStep(this.base, places)
    ) {
      if (this.write(url, places, 'push')) this.unrecorded -= 1;
      return;
    }
    // Промежуточный снимок перехода по записи (панель уже очищена, окно ещё
    // не открыто) стёр бы слоты целевой записи — замена одна, в конце.
    if (this.blocking !== undefined) return;
    // Пока грузится, снимок без грузящейся области: замена стёрла бы её слот
    // в записи, на которую вкладка только что пришла «Назадом».
    if (this.page.loading()) return;
    if (this.written === PageHistory.key(places, this.page.snapshot())) {
      return;
    }
    this.write(url, places, 'replace');
  }

  /**
   * Шаг: уходящее состояние — в текущую запись, затем первое изменение
   * адресов до конца `work` (и после его `await`) — новая запись. Одновременные
   * шаги получают записи по порядку первых изменений. Отказ `work` — отказ шага.
   */
  async step(work: () => Promise<void> | void): Promise<void> {
    // Действие человека вытесняет идущий переход по записи: его загрузка
    // могла зависнуть, а замены нужны текущему шагу.
    this.blocking = undefined;
    this.changed();
    this.base = JSON.stringify(this.page.places());
    this.active += 1;
    this.unrecorded += 1;
    try {
      await work();
    } finally {
      this.active -= 1;
      this.unrecorded = Math.min(this.unrecorded, this.active);
    }
  }

  /**
   * Начало перехода по записи: идущие шаги права на новую запись лишены —
   * изменения перехода относятся к записи, на которую вкладка пришла; замены
   * ждут его конца. Возвращает поколение для `traversed`.
   */
  traversing(): number {
    this.generation += 1;
    this.blocking = this.generation;
    this.unrecorded = 0;
    this.written = undefined;
    return this.generation;
  }

  /**
   * Конец перехода по записи поколения `generation`. Он ещё держит блок —
   * отсев сброшен (записанное относится к прежней записи) и одна замена
   * итогом; вытеснен (новым переходом или шагом) — без действия.
   */
  traversed(generation: number): void {
    if (this.blocking !== generation) return;
    this.blocking = undefined;
    this.written = undefined;
    this.changed();
  }

  /** Записать снимок; отказ порта отсев не обновляет — следующее изменение повторит. */
  private write(
    url: string,
    places: string,
    kind: 'push' | 'replace',
  ): boolean {
    const snapshot = this.page.snapshot();
    const record = PageHistoryRecord.write(snapshot);
    try {
      if (kind === 'push') this.port.push(url, record);
      else this.port.replace(url, record);
    } catch {
      // Бросок браузера несёт URL с параметрами людей — наружу только факт.
      this.onFault();
      return false;
    }
    this.written = PageHistory.key(places, snapshot);
    this.base = places;
    return true;
  }

  /** Шаг ли смена адресов областей: любое изменение (вариант «каждое изменение адреса — шаг»). */
  private static isStep(before: string, after: string): boolean {
    return before !== after;
  }

  /** Ключ отсева: ревизия не в счёт — перечитывание по событию её растит. */
  private static key(places: string, snapshot: PageSnapshot): string {
    const slots: Record<string, unknown> = {};
    for (const [name, slot] of Object.entries(snapshot)) {
      if (slot !== undefined) slots[name] = [slot.address, slot.state];
    }
    return JSON.stringify([places, slots]);
  }
}
