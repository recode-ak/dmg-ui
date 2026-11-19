import type { PageHistoryEntry, PageHistoryPort } from 'dmg-ui/web-ui';

type Handler = (entry: PageHistoryEntry) => Promise<void> | void;

/**
 * Подставная история вкладки для тестов без браузера: записи и положение в
 * памяти. `push` обрезает «Вперёд»; `back`/`forward` сдвигают положение сразу
 * и ждут промисов обработчиков (TST-04, без таймеров); на краю — без действия.
 * `settled()` — ожидание последнего перехода; `reloaded()` — те же записи
 * глазами новой страницы; `fail` — отказ записи.
 * @see ./memory-page-history.test.ts
 */
export class MemoryPageHistory implements PageHistoryPort {
  private records: PageHistoryEntry[];
  private at = 0;
  private readonly handlers: Handler[] = [];
  private refusal: Error | undefined;
  private pushed = 0;
  private replaced = 0;
  /** Обработка последнего перехода: её ждёт `settled`. */
  private going: Promise<void> = Promise.resolve();

  /** Начальная запись — как до первой работы скрипта страницы: `/` без записи. */
  constructor(url = '/', record: unknown = null) {
    this.records = [{ url, record }];
  }

  /** Номер текущей записи. */
  get position(): number {
    return this.at;
  }

  /** Сколько раз принят `push`. */
  get pushes(): number {
    return this.pushed;
  }

  /** Сколько раз принят `replace`. */
  get replaces(): number {
    return this.replaced;
  }

  current(): PageHistoryEntry {
    const entry = this.records[this.at];
    if (entry === undefined) throw new Error('MemoryPageHistory: нет записи');
    return entry;
  }

  push(url: string, record: string): void {
    this.check(url);
    this.records.splice(this.at + 1);
    this.records.push({ url, record });
    this.at = this.records.length - 1;
    this.pushed += 1;
  }

  replace(url: string, record: string): void {
    this.check(url);
    this.records[this.at] = { url, record };
    this.replaced += 1;
  }

  onTraverse(handler: Handler): void {
    this.handlers.push(handler);
  }

  back(): Promise<void> {
    return this.go(-1);
  }

  forward(): Promise<void> {
    return this.go(1);
  }

  /**
   * Обработчики последнего перехода отработали (или отказали) — для перехода,
   * начатого без ожидания (клиент сам зовёт `back()` при закрытии слоя).
   */
  settled(): Promise<void> {
    return this.going;
  }

  entries(): readonly PageHistoryEntry[] {
    return [...this.records];
  }

  /** Та же история после перезагрузки: записи и положение, обработчиков нет, счётчики с нуля. */
  reloaded(): MemoryPageHistory {
    const reloaded = new MemoryPageHistory();
    reloaded.records = [...this.records];
    reloaded.at = this.at;
    return reloaded;
  }

  /** `push` и `replace` бросают `error` до `fail(undefined)`. */
  fail(error?: Error): void {
    this.refusal = error;
  }

  private async go(delta: number): Promise<void> {
    const next = this.at + delta;
    if (next < 0 || next >= this.records.length) return;
    this.at = next;
    const entry = this.current();
    const going = Promise.all(this.handlers.map((handler) => handler(entry)));
    // Отказ обработчика — вызывающему `back`/`forward`; `settled` не отклоняется.
    this.going = going.then(
      () => undefined,
      () => undefined,
    );
    await going;
  }

  /** Отказ записи и URL не своего источника (`//x`, `/\x`, не путь) — бросок, как у браузера. */
  private check(url: string): void {
    if (this.refusal !== undefined) throw this.refusal;
    if (!url.startsWith('/') || url[1] === '/' || url[1] === '\\') {
      throw new Error('MemoryPageHistory: URL не своего источника');
    }
  }
}
