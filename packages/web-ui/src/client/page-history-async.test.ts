import { describe, expect, test } from 'bun:test';
import type { AddressJson } from 'dmg-ui';
import { ASSIGNED_ID, CARD_ID, LIST_ID, TASK_A } from 'dmg-ui/testing';
import { MemoryPageHistory } from '../../testing';
import type { PageSlotJson, PageSnapshot } from './page-client.types';
import { PageHistory } from './page-history';
import type { PageHistoryPage } from './page-history.types';
import { PageHistoryRecord } from './page-history-record';

// Правило записей на отложенной подставе: `back()` порта разрешается до
// `popstate`, положение и `current()` меняет только `release()`. Здесь —
// промежуточное состояние и гонки; итог после `release()` на синхронной
// подставе закреплён в `page-history.test.ts`. Страница — подставной объект
// по образцу того файла; обработчик перехода порта открывает переход истории
// (`traversing`), как это делает клиент.

const LIST0: AddressJson = { screen: LIST_ID, params: { page: 0 } };
const CARD: AddressJson = { screen: CARD_ID, params: { taskId: TASK_A } };
const ASSIGNED: AddressJson = { screen: ASSIGNED_ID, params: {} };
const SIDE = '/?_side=card';
const MODAL = '/?_modal=assigned';
const NONE = { selected: [] };

const slot = (address: AddressJson, state?: unknown): PageSlotJson => ({
  address,
  revision: 1,
  ...(state === undefined ? {} : { state }),
});

type Region = 'main' | 'side' | 'modal';

/** Подставная страница: снимок, адреса, ссылка и грузящаяся область задаются тестом. */
class StubPage implements PageHistoryPage {
  link: string | undefined = '/';
  slots: PageSnapshot = { main: slot(LIST0, NONE) };
  opening:
    | { readonly region: string; readonly address: AddressJson }
    | undefined;

  readonly url = () => this.link;
  readonly snapshot = () => this.slots;
  readonly loading = () => this.opening !== undefined;
  readonly places = () => {
    const places: Record<string, string> = {};
    for (const [name, value] of Object.entries(this.slots)) {
      if (value !== undefined) places[name] = JSON.stringify(value.address);
    }
    if (this.opening !== undefined) {
      places[this.opening.region] = JSON.stringify(this.opening.address);
    }
    return places;
  };

  readonly place = () =>
    (this.opening?.region === 'main'
      ? this.opening.address
      : this.slots.main?.address
    )?.screen;

  load(region: Region, address: AddressJson, link: string): void {
    const { [region]: _gone, ...rest } = this.slots;
    this.slots = rest;
    this.opening = { region, address };
    this.link = link;
  }

  close(region: Region, link: string): void {
    const { [region]: _gone, ...rest } = this.slots;
    this.slots = rest;
    this.link = link;
  }

  placed(state: unknown): void {
    if (this.opening === undefined) throw new Error('ничего не грузится');
    const { region, address } = this.opening;
    this.opening = undefined;
    this.slots = { ...this.slots, [region]: slot(address, state) };
  }
}

/** Порт, который можно заставить отказать в `back()`; считает, сколько раз до него дошли. */
class RefusingPort extends MemoryPageHistory {
  refusing = true;
  backs = 0;

  constructor() {
    super('/', null, 'deferred');
  }

  override back(): Promise<void> {
    this.backs += 1;
    if (this.refusing) return Promise.reject(new Error('отказ порта'));
    return super.back();
  }
}

/** История на подставной странице; переход порта — `traversing()` с запоминанием поколения. */
const recorded = (port: MemoryPageHistory = deferred()) => {
  const page = new StubPage();
  let faults = 0;
  const history = new PageHistory(port, page, () => {
    faults += 1;
  });
  let generation = 0;
  port.onTraverse(() => {
    generation = history.traversing();
  });
  return {
    port,
    page,
    history,
    faults: () => faults,
    /** Поколение последнего перехода, пришедшего из порта. */
    arrived: () => generation,
  };
};

const deferred = () => new MemoryPageHistory('/', null, 'deferred');

type Recorded = ReturnType<typeof recorded>;

const toRoot = (
  { history, page }: Recorded,
  address: AddressJson,
  link: string,
) =>
  history.step(async () => {
    page.load('main', address, link);
    history.changed();
    await Promise.resolve();
    page.placed(undefined);
    history.changed();
  });

const toLayer = (
  { history, page }: Recorded,
  region: Region,
  address: AddressJson,
  link: string,
) =>
  history.step(async () => {
    page.load(region, address, link);
    history.changed();
    await Promise.resolve();
    page.placed(undefined);
    history.changed();
  });

const closeLayer = (
  { history, page }: Recorded,
  region: Region,
  link: string,
) =>
  history.step(() => {
    page.close(region, link);
    history.changed();
  });

/** Отдаёт микрозадачи без таймеров (TST-04). */
const turns = async () => {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

describe('PageHistory.back на отложенной подставе', () => {
  test('закрытие слоя с over: back() ушёл в порт, pending = 1, записей и замен не прибавилось; замены блокированы до traversed', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    const { pushes, replaces, position } = h.port;

    await closeLayer(h, 'side', '/');
    await turns();

    expect(h.port.pending).toBe(1);
    expect(h.port.position).toBe(position);
    expect(h.port.pushes).toBe(pushes);
    expect(h.port.replaces).toBe(replaces);
    h.page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    h.history.changed();
    expect(h.port.replaces).toBe(replaces);
    await h.port.release();
    h.history.traversed(h.arrived());
    expect(h.port.position).toBe(0);
    expect(h.port.replaces).toBe(replaces + 1);
    expect(h.port.pushes).toBe(pushes);
    expect(PageHistoryRecord.read(h.port.current().record).main).toEqual(
      slot(LIST0, { selected: [TASK_A] }),
    );
  });

  test('второе закрытие слоя до release() (хвост и over): порт получил один переход, leaves = 0', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    await closeLayer(h, 'side', '/');
    await turns();
    expect(h.port.pending).toBe(1);

    await toLayer(h, 'modal', ASSIGNED, MODAL);
    await closeLayer(h, 'modal', '/');
    await turns();

    expect(h.port.pending).toBe(1);
    expect(h.port.leaves).toBe(0);
    await h.port.release();
    expect(h.port.position).toBe(0);
    expect(h.port.pending).toBe(0);
    expect(h.port.leaves).toBe(0);
    expect(h.port.entries()).toHaveLength(2);
  });

  test('два back() в одном такте, без await между ними: в порт ушёл один переход', async () => {
    const h = recorded();
    h.history.changed();
    await toRoot(h, ASSIGNED, '/assigned');
    await toRoot(h, CARD, '/card');

    const first = h.history.back();
    const second = h.history.back();

    expect(h.port.pending).toBe(1);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(h.port.pending).toBe(1);
    expect(h.port.leaves).toBe(0);
  });

  test('returnable() пока ждём popstate — false; после traversing() — прежнее значение', async () => {
    const h = recorded();
    h.history.changed();
    await toRoot(h, ASSIGNED, '/assigned');
    expect(h.history.returnable()).toBe(true);

    await h.history.back();

    expect(h.history.returnable()).toBe(false);
    h.history.traversing();
    expect(h.history.returnable()).toBe(true);
  });

  test('отказ порта: back() — false, onFault один раз, ожидание не взведено — следующий back() доходит до порта', async () => {
    const port = new RefusingPort();
    const h = recorded(port);
    h.history.changed();
    await toRoot(h, ASSIGNED, '/assigned');

    expect(await h.history.back()).toBe(false);

    expect(h.faults()).toBe(1);
    expect(port.backs).toBe(1);
    port.refusing = false;
    expect(await h.history.back()).toBe(true);
    expect(port.backs).toBe(2);
    expect(port.pending).toBe(1);
    expect(h.faults()).toBe(1);
  });

  test('синхронная подстава: ожидание не взводится — back() при двух закрытиях слоя подряд работают оба', async () => {
    const h = recorded(new MemoryPageHistory('/'));
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    await closeLayer(h, 'side', '/');
    await turns();
    expect(h.port.position).toBe(0);

    await toLayer(h, 'side', CARD, SIDE);
    expect(h.port.position).toBe(1);
    await closeLayer(h, 'side', '/');

    expect(h.port.position).toBe(0);
    expect(h.port.pushes).toBe(2);
  });
});
