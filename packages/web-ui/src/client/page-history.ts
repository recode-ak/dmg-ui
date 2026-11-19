import type { PageSnapshot } from './page-client.types';
import type {
  PageHistoryLayout,
  PageHistoryMarks,
  PageHistoryOpening,
  PageHistoryPage,
  PageHistoryPort,
} from './page-history.types';
import { PageHistoryRecord } from './page-history-record';

/**
 * Правило записей истории поверх порта (D-UI-81, D-UI-97). Шаг начинает
 * клиент там, где начинается переход; новую запись даёт первое в ходе шага
 * изменение, которое шаг и есть: смена экрана корня (места) или открытие
 * панели либо окна (запись с `over`), каждая новая запись — `depth` на
 * единицу больше; всё следующее до конца шага — замена той же записи.
 * Листание, выбор и всё внутри открытого слоя — замена. Закрытие слоя, чьё
 * открытие положило текущую запись, — движение назад по истории без записи,
 * если области под ним с открытия не менялись (адрес и состояние, не
 * ревизия); менялись — замена без `over`, чтобы не потерять их; закрытие
 * другой области или без `over` — замена. Смена места на записи открытия ждёт конца шага:
 * закрылся слой — это уход из слоя, запись открытия заменяется без `over`;
 * нет — новая запись. Вне шага запись заменяется при изменении адресов или
 * состояния — не пока область грузится, не без ссылки и не во время
 * перехода по записи.
 * @see ./page-history.test.ts
 */
export class PageHistory {
  /** Ключ отсева последнего записанного: адреса и снимок без ревизий. */
  private written: string | undefined;
  /** Идущие шаги. */
  private active = 0;
  /** Идущие шаги, ещё не давшие записи. */
  private unrecorded = 0;
  /** Место и области, против которых шаг без записи ищет изменение: на начало шага или последней записи. */
  private base: PageHistoryLayout | undefined;
  /**
   * Место сменилось на записи открытия слоя: уход из слоя или переход корня
   * при открытом слое — решит закрытие слоя или конец шагов. До решения
   * записи не пишутся.
   */
  private leaving = false;
  /** Открытие слоя, положившее текущую запись; запись без `over` — `undefined`. */
  private opening: PageHistoryOpening | undefined;
  /** Поколение последнего начатого перехода по записи. */
  private generation = 0;
  /**
   * Поколение перехода, который держит блок замен. Блок принадлежит
   * последнему переходу: вытесненный ранний его не держит и не снимает.
   */
  private blocking: number | undefined;
  /**
   * «Назад» ушёл в порт, а переход ещё не пришёл (`traversing`): браузер
   * отвечает `popstate` позже.
   */
  private awaiting = false;

  constructor(
    private readonly port: PageHistoryPort,
    private readonly page: PageHistoryPage,
    private readonly onFault: () => void,
  ) {}

  /** Новое значение какой-то области: запись шага, замена текущей, движение назад или ничего. */
  changed(): void {
    const url = this.page.url();
    // Без ссылки прежний URL с новым снимком не пишется: запись разошлась бы
    // с адресной строкой.
    if (url === undefined) return;
    if (
      this.unrecorded > 0 &&
      this.base !== undefined &&
      this.stepped(url, this.base)
    ) {
      return;
    }
    // Промежуточный снимок перехода по записи (панель уже очищена, окно ещё
    // не открыто) стёр бы слоты целевой записи — замена одна, в конце.
    if (this.blocking !== undefined) return;
    // Пока грузится, снимок без грузящейся области: замена стёрла бы её слот
    // в записи, на которую вкладка только что пришла «Назадом».
    if (this.page.loading()) return;
    if (
      this.written === PageHistory.key(this.page.places(), this.page.snapshot())
    ) {
      return;
    }
    this.write(url, 'replace', this.marks());
  }

  /**
   * Шаг: уходящее состояние — в текущую запись, затем первое изменение-шаг до
   * конца `work` (и после его `await`) — новая запись. Одновременные шаги
   * получают записи по порядку первых изменений. Отказ `work` — отказ шага.
   */
  async step(work: () => Promise<void> | void): Promise<void> {
    // Действие человека вытесняет идущий переход по записи: его загрузка
    // могла зависнуть, а замены нужны текущему шагу.
    this.blocking = undefined;
    this.changed();
    this.base = this.layout();
    this.active += 1;
    this.unrecorded += 1;
    try {
      await work();
    } finally {
      this.active -= 1;
      this.unrecorded = Math.min(this.unrecorded, this.active);
      // Слой так и не закрылся — место сменилось под ним: новая запись. Ждёт
      // всех шагов: закрытие могло прийти от шага, начатого раньше.
      if (this.leaving && this.active === 0) this.left();
    }
  }

  /**
   * Своё место позади есть, текущую запись положило не открытие слоя и
   * прежний «Назад» уже пришёл: выходу корня есть куда вернуться движением
   * назад.
   */
  returnable(): boolean {
    if (this.awaiting) return false;
    const { depth, over } = this.marks();
    return depth > 0 && !over;
  }

  /**
   * Движение назад по истории без второго «Назад» до `popstate` (D-UI-104):
   * шаги права на запись лишены, замены ждут конца перехода, на который
   * придёт вкладка. Пока прежний «Назад» не пришёл (`popstate` позже), новый
   * в порт не уходит — в браузере он сложился бы с прежним и вывел со
   * страницы. Отказ порта — `onFault` и `false`.
   */
  async back(): Promise<boolean> {
    if (this.awaiting) return true;
    this.traversing();
    const before = this.port.current();
    let going: Promise<void> | void;
    try {
      going = this.port.back();
    } catch {
      this.onFault();
      return false;
    }
    // Запись не сменилась внутри вызова — переход придёт позже. Сравнение
    // сразу, до `await`: второй `back()` того же такта (`void this.back()`
    // из `stepped` при втором закрытии слоя) застал бы ожидание не взведённым
    // и ушёл бы в порт — в браузере два «Назад» складываются (E3).
    const after = this.port.current();
    this.awaiting = after.url === before.url && after.record === before.record;
    try {
      await going;
      return true;
    } catch {
      this.awaiting = false;
      this.onFault();
      return false;
    }
  }

  /**
   * Начало перехода по записи: идущие шаги права на новую запись лишены —
   * изменения перехода относятся к записи, на которую вкладка пришла; замены
   * ждут его конца. Возвращает поколение для `traversed`.
   */
  traversing(): number {
    this.awaiting = false;
    this.generation += 1;
    this.blocking = this.generation;
    this.unrecorded = 0;
    this.leaving = false;
    this.opening = undefined;
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

  /**
   * Изменение в ходе шага без записи против `base`: запись шага, замена
   * записи открытия, движение назад — `true`; изменение не из шага (листание,
   * всё внутри слоя, закрытие без `over`) — `false`, дальше как замена.
   */
  private stepped(url: string, base: PageHistoryLayout): boolean {
    const now = this.layout();
    const marks = this.marks();
    const closed = base.regions.filter((name) => !now.regions.includes(name));
    if (this.leaving) {
      // Уход из слоя: место уже сменилось, слой закрылся — та же запись без `over`.
      if (closed.length > 0) this.unover(url, marks);
      return true;
    }
    if (now.place !== base.place) {
      if (marks.over) {
        this.leaving = true;
      } else if (
        this.write(url, 'push', { depth: marks.depth + 1, over: false })
      ) {
        this.unrecorded -= 1;
      }
      return true;
    }
    const opened = now.regions.filter((name) => !base.regions.includes(name));
    if (opened.length > 0) {
      const under = this.under(opened);
      if (this.write(url, 'push', { depth: marks.depth + 1, over: true })) {
        this.unrecorded -= 1;
        this.opening = { layers: opened, under };
      }
      return true;
    }
    // Глубина 0 при `over` — запись не наша по построению: назад не идём,
    // чтобы не уйти со страницы.
    if (closed.length === 0 || !marks.over || marks.depth === 0) return false;
    const opening = this.opening;
    // Закрылась не та область, что положила запись (панель под окном), — замена.
    if (
      opening?.layers !== undefined &&
      !closed.some((name) => opening.layers?.includes(name))
    ) {
      return false;
    }
    if (opening !== undefined && this.shifted(opening, closed)) {
      this.unover(url, marks);
      return true;
    }
    void this.back();
    return true;
  }

  /** Запись открытия заменяется без `over`: слоя, положившего её, больше нет. */
  private unover(url: string, marks: PageHistoryMarks): void {
    this.leaving = false;
    if (this.write(url, 'replace', { depth: marks.depth, over: false })) {
      this.unrecorded -= 1;
    }
  }

  /** Области под слоем сменили адрес или состояние с момента открытия: движение назад их потеряло бы. */
  private shifted(
    opening: PageHistoryOpening,
    closed: readonly string[],
  ): boolean {
    const now = this.under(closed);
    return Object.entries(opening.under).some(
      ([name, key]) => !closed.includes(name) && now[name] !== key,
    );
  }

  /** Адрес и состояние каждой непустой области, кроме `except`; ревизия не в счёт. */
  private under(except: readonly string[]): Record<string, string> {
    const states = new Map<string, unknown>(
      Object.entries(this.page.snapshot()).map(([name, slot]) => [
        name,
        slot?.state,
      ]),
    );
    const keys: Record<string, string> = {};
    for (const [name, place] of Object.entries(this.page.places())) {
      if (!except.includes(name)) {
        keys[name] = JSON.stringify([place, states.get(name)]);
      }
    }
    return keys;
  }

  /** Место сменилось под открытым слоем, слой остался: новая запись без `over`. */
  private left(): void {
    this.leaving = false;
    const url = this.page.url();
    if (url === undefined) return;
    this.write(url, 'push', { depth: this.marks().depth + 1, over: false });
  }

  /** Метки текущей записи порта. */
  private marks(): PageHistoryMarks {
    return PageHistoryRecord.marks(this.port.current().record);
  }

  /** Место и имена непустых областей сейчас. */
  private layout(): PageHistoryLayout {
    return {
      place: this.page.place(),
      regions: Object.keys(this.page.places()),
    };
  }

  /** Записать снимок; отказ порта отсев не обновляет — следующее изменение повторит. */
  private write(
    url: string,
    kind: 'push' | 'replace',
    marks: PageHistoryMarks,
  ): boolean {
    const snapshot = this.page.snapshot();
    const record = PageHistoryRecord.write(snapshot, marks);
    try {
      if (kind === 'push') this.port.push(url, record);
      else this.port.replace(url, record);
    } catch {
      // Бросок браузера несёт URL с параметрами людей — наружу только факт.
      this.onFault();
      return false;
    }
    this.written = PageHistory.key(this.page.places(), snapshot);
    this.base = this.layout();
    // Запись без `over` — открытия нет; вкладка пришла на запись открытия
    // («Назад», перезагрузка) — слой неизвестен, области под ним — как сейчас.
    if (!marks.over) this.opening = undefined;
    else if (this.opening === undefined) {
      this.opening = { layers: undefined, under: this.under([]) };
    }
    return true;
  }

  /** Ключ отсева: ревизия не в счёт — перечитывание по событию её растит. */
  private static key(
    places: Readonly<Record<string, string>>,
    snapshot: PageSnapshot,
  ): string {
    const slots: Record<string, unknown> = {};
    for (const [name, slot] of Object.entries(snapshot)) {
      if (slot !== undefined) slots[name] = [slot.address, slot.state];
    }
    return JSON.stringify([places, slots]);
  }
}
