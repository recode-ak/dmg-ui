import type { AddressJson, ScreenInstance } from 'dmg-ui';
import { PAGE_CHANNEL } from '../page-channel.const';
import type { PageViewState } from '../view/page-view-state.types';
import type { ViewSource } from '../view/view-source.types';
import { PAGE_REGIONS } from './page-client.const';
import type {
  PageRegionName,
  PageSlotJson,
  PageSnapshot,
  PendingConfirm,
  RegionMarks,
  RegionSlot,
} from './page-client.types';
import type { PagePlacements } from './page-placements';
import { ViewCell } from './view-cell';

/**
 * Области страницы по перечню `PAGE_REGIONS` и политика переходов: куда
 * открыть экран, решает `PagePlacements`. В области — один живой
 * экземпляр: открытие закрывает прежний сразу, в область встаёт экземпляр
 * последнего начатого открытия. Каждое изменение — новое значение
 * `PageViewState` в ячейке области (D-UI-70). Без связи непустая область
 * помечена `stale: 'offline'` до перечитывания (D-UI-74).
 */
export class PageRegions {
  private readonly slots = new Map<PageRegionName, RegionSlot>();
  private tickets = 0;
  private online = true;

  /** `onFault` — бросок слушателя ячейки: узел — экран области или канал. */
  constructor(
    onFault: (node: string, error: unknown) => void,
    private readonly placements: PagePlacements,
  ) {
    for (const name of PAGE_REGIONS) {
      this.slots.set(name, PageRegions.empty(onFault));
    }
  }

  /** Источник состояния области — один объект на всё время жизни вкладки. */
  source(name: PageRegionName): ViewSource<PageViewState> {
    return this.slot(name).cell;
  }

  state(name: PageRegionName): PageViewState {
    return this.slot(name).cell.get();
  }

  instance(name: PageRegionName): ScreenInstance | undefined {
    return this.slot(name).instance;
  }

  /** Связь есть: новые данные областей читаются по текущему соединению. */
  get connected(): boolean {
    return this.online;
  }

  /** Данные области — с прежнего соединения или ждут соединения. */
  behind(name: PageRegionName): boolean {
    return this.slot(name).behind;
  }

  /** Ожидающее подтверждение области. */
  pending(name: PageRegionName): PendingConfirm | undefined {
    return this.slot(name).marks.confirm;
  }

  /** Куда ведёт исход `moved` на экран `screen` из области (без `from` — ссылка). */
  target(from: PageRegionName | undefined, screen: string): PageRegionName {
    const current =
      from === undefined ? undefined : this.slot(from).instance?.view().screen;
    return this.placements.target(from, current, screen);
  }

  /**
   * Начало открытия, синхронно: прежний экземпляр закрыт, область в
   * `loading` с адресом и отметками. Возвращает жетон для `place`.
   */
  opening(
    name: PageRegionName,
    address: AddressJson,
    marks: RegionMarks = {},
  ): number {
    const slot = this.slot(name);
    this.release(slot);
    slot.marks = marks;
    slot.loading = address;
    slot.ticket = this.ticket();
    slot.behind = !this.online;
    this.publish(slot);
    return slot.ticket;
  }

  /**
   * Экземпляр открытия в область; жетон не последний — экземпляр закрыт,
   * область не тронута. `behind` — экземпляр открыт с контекстом прежнего
   * соединения: помечен, как без связи, до перечитывания.
   */
  place(
    name: PageRegionName,
    ticket: number,
    instance: ScreenInstance,
    behind = false,
  ): void {
    const slot = this.slot(name);
    if (slot.ticket !== ticket) {
      instance.close();
      return;
    }
    slot.loading = undefined;
    slot.instance = instance;
    slot.unlisten = instance.onChange(() => this.changed(slot));
    slot.behind = behind || !this.online;
    this.publish(slot);
  }

  /**
   * Открытие с жетоном отказало: область всё ещё грузится им — пуста с
   * отметками; вставшая или занятая другим открытием — не тронута.
   */
  failed(
    name: PageRegionName,
    ticket: number | undefined,
    marks: RegionMarks,
  ): void {
    const slot = this.slot(name);
    if (ticket === undefined || slot.ticket !== ticket) return;
    if (slot.loading === undefined) return;
    this.release(slot);
    slot.marks = marks;
    this.publish(slot);
  }

  /**
   * Начало восстановления области по новому соединению: новый жетон, прежний
   * вид на месте с `refreshing`. Возвращает жетон для `replace`.
   */
  resyncing(name: PageRegionName): number {
    const slot = this.slot(name);
    slot.ticket = this.ticket();
    slot.resync = slot.ticket;
    this.publish(slot);
    return slot.ticket;
  }

  /**
   * Восстановленный экземпляр встаёт на место прежнего: прежний закрыт,
   * отметки сняты. Жетон не последний (переход во время восстановления) —
   * восстановленный закрыт, область не тронута.
   */
  replace(
    name: PageRegionName,
    ticket: number,
    instance: ScreenInstance,
  ): void {
    const slot = this.slot(name);
    if (slot.ticket !== ticket) {
      instance.close();
      return;
    }
    this.release(slot);
    slot.marks = {};
    slot.instance = instance;
    slot.unlisten = instance.onChange(() => this.changed(slot));
    slot.behind = !this.online;
    this.publish(slot);
  }

  /** Восстановление с жетоном не удалось: область всё ещё его — пуста с отметками. */
  resyncFailed(name: PageRegionName, ticket: number, marks: RegionMarks): void {
    const slot = this.slot(name);
    if (slot.ticket !== ticket) return;
    this.release(slot);
    slot.marks = marks;
    this.publish(slot);
  }

  /** Связь пропала: каждая непустая область помечена до перечитывания. */
  disconnect(): void {
    this.online = false;
    for (const name of PAGE_REGIONS) {
      const slot = this.slot(name);
      if (slot.instance === undefined && slot.loading === undefined) continue;
      slot.behind = true;
      this.publish(slot);
    }
  }

  /** Связь есть; пометки областей снимает их перечитывание или открытие. */
  connect(): void {
    this.online = true;
  }

  /** Область пуста: экземпляр закрыт, идущее открытие отменено, остаются отметки. */
  clear(name: PageRegionName, marks: RegionMarks = {}): void {
    const slot = this.slot(name);
    this.release(slot);
    slot.marks = marks;
    slot.ticket = this.ticket();
    this.publish(slot);
  }

  /** Отметки области после сигнала — заменяют прежние целиком. */
  mark(name: PageRegionName, marks: RegionMarks): void {
    const slot = this.slot(name);
    slot.marks = marks;
    this.publish(slot);
  }

  /**
   * Сигнал перечитывания по адресу: готовая область с этим адресом —
   * `refreshing` до `settled()` экземпляра (D-UI-49). Склеенные сигналы —
   * один период: признак снимает только последний жетон. Область с данными
   * прежнего соединения сигнал пропускает: её перечитает восстановление.
   */
  signalled(address: AddressJson): void {
    const key = JSON.stringify(address);
    for (const name of PAGE_REGIONS) {
      const slot = this.slot(name);
      const instance = slot.instance;
      if (instance === undefined || slot.behind) continue;
      const view = instance.view();
      if (view.status !== 'ready' || JSON.stringify(view.address) !== key) {
        continue;
      }
      const started = slot.refresh === undefined;
      const token = this.ticket();
      slot.refresh = token;
      if (started) this.publish(slot);
      const done = () => {
        if (slot.refresh !== token || slot.instance !== instance) return;
        slot.refresh = undefined;
        this.publish(slot);
      };
      // Отказ задачи очереди — тоже конец перечитывания.
      instance.settled().then(done, done);
    }
  }

  /** Снимок областей с экземпляром — в форме JSON (без `state: undefined`). */
  snapshot(): PageSnapshot {
    const slots: Partial<Record<PageRegionName, PageSlotJson>> = {};
    for (const name of PAGE_REGIONS) {
      const instance = this.slot(name).instance;
      if (instance === undefined) continue;
      const { address, revision, state } = instance.snapshot();
      slots[name] = {
        address,
        revision,
        ...(state === undefined ? {} : { state }),
      };
    }
    return slots;
  }

  /** Вид экземпляра изменился; не `ready` — перечитывания больше не будет. */
  private changed(slot: RegionSlot): void {
    if (slot.instance?.view().status !== 'ready') slot.refresh = undefined;
    this.publish(slot);
  }

  private release(slot: RegionSlot): void {
    slot.unlisten?.();
    slot.instance?.close();
    slot.instance = undefined;
    slot.unlisten = undefined;
    slot.loading = undefined;
    slot.refresh = undefined;
    slot.resync = undefined;
    slot.behind = false;
  }

  private publish(slot: RegionSlot): void {
    slot.cell.set(PageRegions.stateOf(slot));
  }

  private ticket(): number {
    this.tickets += 1;
    return this.tickets;
  }

  private slot(name: PageRegionName): RegionSlot {
    const slot = this.slots.get(name);
    if (slot === undefined) {
      throw new Error(`PageRegions: нет области ${name}`);
    }
    return slot;
  }

  /**
   * Новое значение состояния по слоту: только данные JSON. `offline` — у
   * непустой области с данными прежнего соединения, важнее `revision`.
   */
  private static stateOf(slot: RegionSlot): PageViewState {
    const { note, issues = [], confirm, entered } = slot.marks;
    const empty = slot.instance === undefined && slot.loading === undefined;
    const stale = slot.behind && !empty ? 'offline' : slot.marks.stale;
    const marks = {
      refreshing: slot.refresh !== undefined || slot.resync !== undefined,
      ...(stale === undefined ? {} : { stale }),
      ...(note === undefined ? {} : { note }),
      issues,
      ...(entered === undefined ? {} : { entered }),
      ...(confirm === undefined
        ? {}
        : {
            confirm: {
              action: confirm.action,
              label: confirm.label,
              description: confirm.description,
            },
          }),
    };
    if (slot.instance !== undefined) {
      const view = slot.instance.view();
      switch (view.status) {
        case 'ready':
        case 'refused':
          return { status: view.status, address: view.address, view, ...marks };
        default:
          return PageRegions.unknown(view.status);
      }
    }
    if (slot.loading !== undefined) {
      return { status: 'loading', address: slot.loading, ...marks };
    }
    return { status: 'empty', ...marks };
  }

  private static empty(
    onFault: (node: string, error: unknown) => void,
  ): RegionSlot {
    const cell: ViewCell<PageViewState> = new ViewCell<PageViewState>(
      { status: 'empty', refreshing: false, issues: [] },
      (error) => onFault(cell.get().address?.screen ?? PAGE_CHANNEL, error),
    );
    return {
      cell,
      instance: undefined,
      unlisten: undefined,
      marks: {},
      loading: undefined,
      ticket: 0,
      refresh: undefined,
      resync: undefined,
      behind: false,
    };
  }

  /** Статус вида, которого не знает `switch` (новый в ядре), — дефект канала, бросок (ERR-06). */
  private static unknown(status: never): never {
    throw new Error(
      `PageRegions: неизвестный статус вида ${JSON.stringify(status)}`,
    );
  }
}
