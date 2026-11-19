import type { PageHistoryEntry, PageHistoryPort } from 'dmg-ui/web-ui';
import type { MemoryPageHistoryMode } from './memory-page-history.types';

type Handler = (entry: PageHistoryEntry) => Promise<void> | void;

/**
 * Подставная история вкладки для тестов без браузера, с режимом браузера
 * `deferred` по замерам Chrome (D-UI-104): записи и положение в памяти. `push` обрезает «Вперёд»; на краю — без действия, «Назад» перед
 * первой записью считается уходом со страницы (`leaves`). `settled()` —
 * ожидание последнего перехода; `reloaded()` — те же записи глазами новой
 * страницы; `fail` — отказ записи.
 *
 * Режим `immediate` (умолчание): `back`/`forward` сдвигают положение сразу и
 * ждут промисов обработчиков (TST-04, без таймеров).
 *
 * Режим `deferred` описывает Chrome: `back`/`forward`
 * разрешаются сразу, переход ждёт `release()`; цель считается от цели
 * последнего неотпущенного перехода. `push` до `release()` ложится во
 * временный хвост — `current()` его видит, первый `release()` снимает вместе
 * с записями, «Вперёд» ведёт к прежним; `replace` меняет текущую сейчас запись.
 * @see ./memory-page-history.test.ts
 */
export class MemoryPageHistory implements PageHistoryPort {
  private records: PageHistoryEntry[];
  private at = 0;
  private readonly handlers: Handler[] = [];
  private refusal: Error | undefined;
  private pushed = 0;
  private replaced = 0;
  private left = 0;
  /** Цели неотпущенных переходов режима `deferred` — по порядку. */
  private targets: number[] = [];
  /** Записи, положенные при неотпущенном переходе: их снимет первый `release()`. */
  private tail: PageHistoryEntry[] = [];
  /** Обработка последнего перехода: её ждёт `settled`. */
  private going: Promise<void> = Promise.resolve();

  /** Начальная запись — как до первой работы скрипта страницы: `/` без записи. */
  constructor(
    url = '/',
    record: unknown = null,
    private readonly mode: MemoryPageHistoryMode = 'immediate',
  ) {
    this.records = [{ url, record }];
  }

  /** Номер текущей записи (без временного хвоста). */
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

  /** Неотпущенные переходы режима `deferred`. */
  get pending(): number {
    return this.targets.length;
  }

  /** Сколько раз «Назад» ушёл бы перед первой записью — со страницы. */
  get leaves(): number {
    return this.left;
  }

  current(): PageHistoryEntry {
    const entry = this.tail.at(-1) ?? this.records[this.at];
    if (entry === undefined) throw new Error('MemoryPageHistory: нет записи');
    return entry;
  }

  push(url: string, record: string): void {
    this.check(url);
    this.pushed += 1;
    if (this.targets.length > 0) {
      this.tail.push({ url, record });
      return;
    }
    this.records.splice(this.at + 1);
    this.records.push({ url, record });
    this.at = this.records.length - 1;
  }

  replace(url: string, record: string): void {
    this.check(url);
    this.replaced += 1;
    if (this.tail.length > 0) this.tail[this.tail.length - 1] = { url, record };
    else this.records[this.at] = { url, record };
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
   * Режим `deferred`: первый неотпущенный переход приходит — хвост снят,
   * положение сдвинуто, промис ждёт обработчиков. Без неотпущенного — бросок.
   */
  release(): Promise<void> {
    const target = this.targets.shift();
    if (target === undefined) {
      throw new Error('MemoryPageHistory: нет неотпущенного перехода');
    }
    this.tail = [];
    return this.arrive(target);
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

  /**
   * Та же история после перезагрузки: записи, положение и режим; обработчиков
   * нет, счётчики с нуля; неотпущенные переходы и хвост пропали с выгрузкой.
   */
  reloaded(): MemoryPageHistory {
    const reloaded = new MemoryPageHistory('/', null, this.mode);
    reloaded.records = [...this.records];
    reloaded.at = this.at;
    return reloaded;
  }

  /** `push` и `replace` бросают `error` до `fail(undefined)`. */
  fail(error?: Error): void {
    this.refusal = error;
  }

  private async go(delta: number): Promise<void> {
    const next = (this.targets.at(-1) ?? this.at) + delta;
    if (next < 0) {
      this.left += 1;
      return;
    }
    if (next >= this.records.length) return;
    if (this.mode === 'deferred') {
      this.targets.push(next);
      return;
    }
    await this.arrive(next);
  }

  /** Вкладка на записи `at`: обработчики получают её, промис ждёт их. */
  private async arrive(at: number): Promise<void> {
    this.at = at;
    const entry = this.current();
    const going = Promise.all(this.handlers.map((handler) => handler(entry)));
    // Отказ обработчика — вызывающему `back`/`forward`/`release`; `settled` не отклоняется.
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
