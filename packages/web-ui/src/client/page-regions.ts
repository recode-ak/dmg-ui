import type { AddressJson, ScreenInstance } from 'dmg-ui';
import { PAGE_CHANNEL } from '../page-channel.const';
import type { PageViewState } from '../view/page-view-state.types';
import type { ViewSource } from '../view/view-source.types';
import type {
  PageRegionName,
  PageSlotJson,
  PageSnapshot,
  PendingConfirm,
  RegionMarks,
  RegionSlot,
} from './page-client.types';
import { ViewCell } from './view-cell';

const REGIONS: readonly PageRegionName[] = ['main', 'side'];

/**
 * Две области страницы — `main` и `side` — и политика переходов:
 * `moved` на тот же Def — на месте, на другой — в соседнюю область. В
 * области — один живой экземпляр: открытие закрывает прежний сразу, в
 * область встаёт экземпляр последнего начатого открытия. Каждое изменение —
 * новое значение `PageViewState` в ячейке области (D-UI-70).
 */
export class PageRegions {
  private readonly slots: Readonly<Record<PageRegionName, RegionSlot>>;
  private tickets = 0;

  /** `onFault` — бросок слушателя ячейки: узел — экран области или канал. */
  constructor(onFault: (node: string, error: unknown) => void) {
    this.slots = {
      main: PageRegions.empty(onFault),
      side: PageRegions.empty(onFault),
    };
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

  /** Ожидающее подтверждение области. */
  pending(name: PageRegionName): PendingConfirm | undefined {
    return this.slot(name).marks.confirm;
  }

  /** Куда ведёт исход `moved` на экран `screen` из области. */
  target(from: PageRegionName, screen: string): PageRegionName {
    const current = this.slot(from).instance?.view().screen;
    if (current === screen) return from;
    return from === 'main' ? 'side' : 'main';
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
    this.publish(slot);
    return slot.ticket;
  }

  /** Экземпляр открытия в область; жетон не последний — экземпляр закрыт, область не тронута. */
  place(name: PageRegionName, ticket: number, instance: ScreenInstance): void {
    const slot = this.slot(name);
    if (slot.ticket !== ticket) {
      instance.close();
      return;
    }
    slot.loading = undefined;
    slot.instance = instance;
    slot.unlisten = instance.onChange(() => this.changed(slot));
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
   * один период: признак снимает только последний жетон.
   */
  signalled(address: AddressJson): void {
    const key = JSON.stringify(address);
    for (const name of REGIONS) {
      const slot = this.slot(name);
      const instance = slot.instance;
      if (instance === undefined) continue;
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
    for (const name of REGIONS) {
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
  }

  private publish(slot: RegionSlot): void {
    slot.cell.set(PageRegions.stateOf(slot));
  }

  private ticket(): number {
    this.tickets += 1;
    return this.tickets;
  }

  private slot(name: PageRegionName): RegionSlot {
    return this.slots[name];
  }

  /** Новое значение состояния по слоту: только данные JSON. */
  private static stateOf(slot: RegionSlot): PageViewState {
    const { note, issues = [], confirm, stale } = slot.marks;
    const marks = {
      refreshing: slot.refresh !== undefined,
      ...(stale === undefined ? {} : { stale }),
      ...(note === undefined ? {} : { note }),
      issues,
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
    };
  }

  /** Статус вида, которого не знает `switch` (новый в ядре), — дефект канала, бросок (ERR-06). */
  private static unknown(status: never): never {
    throw new Error(
      `PageRegions: неизвестный статус вида ${JSON.stringify(status)}`,
    );
  }
}
