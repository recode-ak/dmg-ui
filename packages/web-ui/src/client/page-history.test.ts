import { describe, expect, test } from 'bun:test';
import type { AddressJson } from 'dmg-ui';
import { ASSIGNED_ID, CARD_ID, LIST_ID, TASK_A, TASK_B } from 'dmg-ui/example';
import { MemoryPageHistory } from '../../testing';
import type { PageSlotJson, PageSnapshot } from './page-client.types';
import { PageHistory } from './page-history';
import type { PageHistoryPage } from './page-history.types';
import { PageHistoryRecord } from './page-history-record';

// Правило записей истории поверх порта. Шаг (новая запись) — смена экрана
// корневой области или открытие панели либо окна над тем же местом: первое
// такое изменение в ходе шага даёт `push`, всё следующее до его конца —
// замену той же записи. Запись открытия слоя несёт `over`, каждая новая
// запись — `depth` на единицу больше. Закрытие слоя, если текущую запись
// положило его открытие, — `back()` порта без записи; без `over` — замена.
// Листание (те же экран и слои, другие параметры), выбор и всё внутри слоя —
// замена. Вне шага текущая запись переписывается при изменении адресов или
// состояния (ревизия не в счёт), но не пока область грузится и не без ссылки.
// Страница здесь — подставной объект: адреса, снимок, ссылка, загрузка и ключ
// места (экран корня без параметров) задаются тестом; порт — подставная
// история. Слои — все области, кроме той, чей экран назван ключом места.

const LIST0: AddressJson = { screen: LIST_ID, params: { page: 0 } };
const LIST1: AddressJson = { screen: LIST_ID, params: { page: 1 } };
const CARD: AddressJson = { screen: CARD_ID, params: { taskId: TASK_A } };
const CARD_B: AddressJson = { screen: CARD_ID, params: { taskId: TASK_B } };
const ASSIGNED: AddressJson = { screen: ASSIGNED_ID, params: {} };
/** Ссылка с карточкой в боковой области. */
const SIDE = '/?_side=card';

/** Начальное состояние списка. */
const NONE = { selected: [] };

/** Слот снимка; без состояния — без поля `state`, как у экрана без состояния. */
const slot = (
  address: AddressJson,
  state?: unknown,
  revision = 1,
): PageSlotJson => ({
  address,
  revision,
  ...(state === undefined ? {} : { state }),
});

type Region = 'main' | 'side' | 'modal';

/**
 * Подставная страница: снимок — области с экземпляром, адреса — их и
 * грузящейся области (`opening`), ссылка — как задал тест.
 */
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

  /** Экран корневой области без параметров: ключ места. */
  readonly place = () =>
    (this.opening?.region === 'main'
      ? this.opening.address
      : this.slots.main?.address
    )?.screen;

  /** Область начала грузиться по адресу: экземпляра в ней нет, адрес есть. */
  load(region: Region, address: AddressJson, link: string): void {
    const { [region]: _gone, ...rest } = this.slots;
    this.slots = rest;
    this.opening = { region, address };
    this.link = link;
  }

  /** Область закрыта. */
  close(region: Region, link: string): void {
    const { [region]: _gone, ...rest } = this.slots;
    this.slots = rest;
    this.link = link;
  }

  /** Загрузка закончилась: экземпляр встал с состоянием `state`. */
  placed(state: unknown): void {
    if (this.opening === undefined) throw new Error('ничего не грузится');
    const { region, address } = this.opening;
    this.opening = undefined;
    this.slots = { ...this.slots, [region]: slot(address, state) };
  }
}

/** История на подставной странице: начальная запись `/` без записи истории. */
const recorded = (port = new MemoryPageHistory('/')) => {
  const page = new StubPage();
  let faults = 0;
  const calls: unknown[][] = [];
  const history = new PageHistory(port, page, (...args: unknown[]) => {
    faults += 1;
    calls.push(args);
  });
  return { port, page, history, faults: () => faults, calls };
};

/** Записанные слоты текущей записи порта. */
const regionsOf = (port: MemoryPageHistory, at = port.position) =>
  PageHistoryRecord.read(port.entries()[at]?.record);

/** Метки записи порта: сколько своих записей позади и открытием ли слоя она положена. */
const marksOf = (port: MemoryPageHistory, at = port.position) =>
  PageHistoryRecord.marks(port.entries()[at]?.record);

type Recorded = ReturnType<typeof recorded>;

/** Шаг: корень стал экраном `address` — грузится и встаёт. */
const toRoot = (
  { history, page }: Recorded,
  address: AddressJson,
  link: string,
  state?: unknown,
) =>
  history.step(async () => {
    page.load('main', address, link);
    history.changed();
    await Promise.resolve();
    page.placed(state);
    history.changed();
  });

/** Шаг: в области `region` открыт экран `address` — грузится и встаёт. */
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

/** Шаг: область `region` закрыта. */
const closeLayer = (
  { history, page }: Recorded,
  region: Region,
  link: string,
) =>
  history.step(() => {
    page.close(region, link);
    history.changed();
  });

describe('PageHistory.changed — замена текущей записи', () => {
  test('первое значение страницы — замена начальной записи: URL и снимок, без шага', () => {
    const { port, page, history } = recorded();

    history.changed();

    expect(port.entries()).toEqual([
      { url: '/', record: PageHistoryRecord.write(page.slots) },
    ]);
    expect(port.replaces).toBe(1);
    expect(port.pushes).toBe(0);
  });

  test('новое состояние области — та же запись заменена, новых записей нет', () => {
    const { port, page, history } = recorded();
    history.changed();

    page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    history.changed();

    expect(port.entries()).toHaveLength(1);
    expect(port.replaces).toBe(2);
    expect(port.pushes).toBe(0);
    expect(regionsOf(port)).toEqual({
      main: slot(LIST0, { selected: [TASK_A] }),
    });
  });

  test('новая ссылка вне шага — замена с новым URL', () => {
    const { port, page, history } = recorded();
    history.changed();

    page.slots = { main: slot(LIST1, NONE) };
    page.link = '/?page=1';
    history.changed();

    expect(port.entries().map((entry) => entry.url)).toEqual(['/?page=1']);
    expect(port.pushes).toBe(0);
  });

  test('отсев: повтор того же значения порт не зовёт', () => {
    const { port, history } = recorded();
    history.changed();

    history.changed();
    history.changed();

    expect(port.replaces).toBe(1);
  });

  test('отсев: смена только ревизии порт не зовёт', () => {
    const { port, page, history } = recorded();
    history.changed();

    page.slots = { main: slot(LIST0, NONE, 2) };
    history.changed();
    page.slots = { main: slot(LIST0, NONE, 7) };
    history.changed();

    expect(port.replaces).toBe(1);
    expect(regionsOf(port).main).toEqual(slot(LIST0, NONE));
  });

  test('пока область грузится, замены нет; после загрузки — одна', () => {
    const { port, page, history } = recorded();
    history.changed();
    page.load('side', CARD, '/');
    page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };

    history.changed();
    history.changed();

    expect(port.replaces).toBe(1);
    page.placed(undefined);
    history.changed();
    history.changed();
    expect(port.replaces).toBe(2);
    expect(Object.keys(regionsOf(port)).sort()).toEqual(['main', 'side']);
  });

  test('ссылки нет — ни замены, ни шага, ни вызова порта', async () => {
    const { port, page, history, faults } = recorded();
    page.link = undefined;

    history.changed();
    await history.step(() => {
      page.slots = { main: slot(LIST1, NONE) };
      history.changed();
    });

    expect(port.replaces).toBe(0);
    expect(port.pushes).toBe(0);
    expect(port.entries()).toEqual([{ url: '/', record: null }]);
    expect(faults()).toBe(0);
  });
});

describe('PageHistory.step — шаг истории', () => {
  test('смена экрана корня: до работы — замена уходящего; первое изменение места — новая запись; следующее до конца шага — замена той же', async () => {
    const h = recorded();
    h.history.changed();
    h.page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    let before: unknown;

    await h.history.step(async () => {
      before = regionsOf(h.port).main;
      h.page.load('main', ASSIGNED, '/assigned');
      h.history.changed();
      expect(h.port.pushes).toBe(1);
      await Promise.resolve();
      h.page.placed(undefined);
      h.history.changed();
    });

    expect(before).toEqual(slot(LIST0, { selected: [TASK_A] }));
    expect(h.port.pushes).toBe(1);
    expect(h.port.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/assigned',
    ]);
    expect(regionsOf(h.port, 0)).toEqual({
      main: slot(LIST0, { selected: [TASK_A] }),
    });
    expect(regionsOf(h.port, 1)).toEqual({ main: slot(ASSIGNED) });
  });

  test('запись шага кладётся на первом изменении места: грузящейся области в ней нет', async () => {
    const { port, page, history } = recorded();
    history.changed();
    let pushed: unknown;

    await history.step(async () => {
      page.load('main', ASSIGNED, '/assigned');
      history.changed();
      pushed = port.entries()[1];
      await Promise.resolve();
      page.placed(undefined);
      history.changed();
    });

    expect(pushed).toEqual({
      url: '/assigned',
      record: expect.any(String),
    });
    expect(regionsOf(port, 1)).toEqual({ main: slot(ASSIGNED) });
  });

  test('шаг без смены места и слоёв — только замена, новых записей нет', async () => {
    const { port, page, history } = recorded();
    history.changed();

    await history.step(() => {
      page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
      history.changed();
    });

    expect(port.pushes).toBe(0);
    expect(port.entries()).toHaveLength(1);
    expect(regionsOf(port).main).toEqual(slot(LIST0, { selected: [TASK_A] }));
  });

  test('смена экрана корня только после await в работе шага — всё равно новая запись', async () => {
    const { port, page, history } = recorded();
    page.slots = { main: slot(LIST0, NONE), modal: slot(CARD) };
    history.changed();

    await history.step(async () => {
      await Promise.resolve();
      page.load('main', ASSIGNED, '/assigned');
      history.changed();
      await Promise.resolve();
      page.placed(undefined);
      history.changed();
    });

    expect(port.pushes).toBe(1);
    expect(Object.keys(regionsOf(port, 0)).sort()).toEqual(['main', 'modal']);
    expect(Object.keys(regionsOf(port, 1)).sort()).toEqual(['main', 'modal']);
  });

  test('шаг на тот же адрес при пустом отсеве — новой записи нет', async () => {
    const { port, page, history } = recorded();
    page.load('main', LIST0, '/');

    await history.step(async () => {
      page.load('main', LIST0, '/');
      history.changed();
      await Promise.resolve();
      page.placed(NONE);
      history.changed();
    });

    expect(port.pushes).toBe(0);
    expect(port.entries()).toHaveLength(1);
    expect(regionsOf(port).main).toEqual(slot(LIST0, NONE));
  });

  test('после конца шага смена экрана корня — замена, а не новая запись', async () => {
    const { port, page, history } = recorded();
    history.changed();
    await history.step(() => undefined);

    page.slots = { main: slot(ASSIGNED) };
    page.link = '/assigned';
    history.changed();

    expect(port.pushes).toBe(0);
    expect(port.entries().map((entry) => entry.url)).toEqual(['/assigned']);
  });

  test('листание — другие параметры того же экрана корня — замена: записи те же, URL новый', async () => {
    const h = recorded();
    h.history.changed();

    await toRoot(h, LIST1, '/?page=1', NONE);

    expect(h.port.pushes).toBe(0);
    expect(h.port.entries().map((entry) => entry.url)).toEqual(['/?page=1']);
    expect(regionsOf(h.port).main).toEqual(slot(LIST1, NONE));
    expect(marksOf(h.port)).toEqual({ depth: 0, over: false });
  });

  test('открытие панели — новая запись с over; прежняя без over; грузящейся панели в записи нет', async () => {
    const h = recorded();
    h.history.changed();
    let pushed: unknown;

    await h.history.step(async () => {
      h.page.load('side', CARD, SIDE);
      h.history.changed();
      pushed = regionsOf(h.port);
      await Promise.resolve();
      h.page.placed(undefined);
      h.history.changed();
    });

    expect(h.port.pushes).toBe(1);
    expect(pushed).toEqual({ main: slot(LIST0, NONE) });
    expect(Object.keys(regionsOf(h.port)).sort()).toEqual(['main', 'side']);
    expect(marksOf(h.port)).toEqual({ depth: 1, over: true });
    expect(marksOf(h.port, 0)).toEqual({ depth: 0, over: false });
  });

  test('открытие окна поверх открытой панели — тоже запись с over', async () => {
    const h = recorded();
    h.page.slots = { main: slot(LIST0, NONE), side: slot(CARD) };
    h.history.changed();

    await toLayer(h, 'modal', ASSIGNED, '/?_side=card');

    expect(h.port.pushes).toBe(1);
    expect(Object.keys(regionsOf(h.port)).sort()).toEqual([
      'main',
      'modal',
      'side',
    ]);
    expect(marksOf(h.port)).toEqual({ depth: 1, over: true });
  });

  test('внутри открытого слоя — замена: другой экран слоя, его состояние; запись всё ещё с over', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);

    await toLayer(h, 'side', CARD_B, '/?_side=card-b');
    await h.history.step(() => {
      h.page.slots = { ...h.page.slots, side: slot(CARD_B, { note: 'x' }) };
      h.history.changed();
    });

    expect(h.port.pushes).toBe(1);
    expect(h.port.entries()).toHaveLength(2);
    expect(h.port.current().url).toBe('/?_side=card-b');
    expect(regionsOf(h.port).side).toEqual(slot(CARD_B, { note: 'x' }));
    expect(marksOf(h.port)).toEqual({ depth: 1, over: true });
  });

  test('закрытие слоя при over — back() порта: положение назад, записей и замен не прибавилось', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    const { pushes, replaces } = h.port;
    const written = h.port.entries();

    await closeLayer(h, 'side', '/');

    expect(h.port.position).toBe(0);
    expect(h.port.pushes).toBe(pushes);
    expect(h.port.replaces).toBe(replaces);
    expect(h.port.entries()).toEqual(written);
  });

  test('закрытие слоя без over (запись пришла по ссылке) — замена, назад не идём', async () => {
    const port = new MemoryPageHistory('/');
    port.push('/earlier', 'запись');
    const h = recorded(port);
    h.page.slots = { main: slot(LIST0, NONE), side: slot(CARD) };
    h.page.link = SIDE;
    h.history.changed();
    const replaces = port.replaces;

    await closeLayer(h, 'side', '/');

    expect(port.position).toBe(1);
    expect(port.pushes).toBe(1);
    expect(port.replaces).toBe(replaces + 1);
    expect(port.current().url).toBe('/');
    expect(Object.keys(regionsOf(port))).toEqual(['main']);
  });

  test('окно поверх панели, запись положило окно: закрытие панели — замена, назад не идём, over остаётся', async () => {
    const h = recorded();
    h.page.slots = { main: slot(LIST0, NONE), side: slot(CARD) };
    h.page.link = SIDE;
    h.history.changed();
    await toLayer(h, 'modal', ASSIGNED, SIDE);
    const replaces = h.port.replaces;

    await closeLayer(h, 'side', '/');

    expect(h.port.position).toBe(1);
    expect(h.port.pushes).toBe(1);
    expect(h.port.replaces).toBe(replaces + 1);
    expect(Object.keys(regionsOf(h.port)).sort()).toEqual(['main', 'modal']);
    expect(marksOf(h.port)).toEqual({ depth: 1, over: true });
  });

  test('листание корня под слоем, затем закрытие слоя — замена без over: страница листания не теряется', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    await toRoot(h, LIST1, '/?page=1&_side=card', NONE);

    await closeLayer(h, 'side', '/?page=1');

    expect(h.port.position).toBe(1);
    expect(h.port.pushes).toBe(1);
    expect(h.port.current().url).toBe('/?page=1');
    expect(regionsOf(h.port)).toEqual({ main: slot(LIST1, NONE) });
    expect(marksOf(h.port)).toEqual({ depth: 1, over: false });
  });

  test('выбор в корне под слоем, затем закрытие слоя — замена без over: выбор не теряется', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    await h.history.step(() => {
      h.page.slots = {
        ...h.page.slots,
        main: slot(LIST0, { selected: [TASK_A] }),
      };
      h.history.changed();
    });

    await closeLayer(h, 'side', '/');

    expect(h.port.position).toBe(1);
    expect(regionsOf(h.port)).toEqual({
      main: slot(LIST0, { selected: [TASK_A] }),
    });
    expect(marksOf(h.port)).toEqual({ depth: 1, over: false });
  });

  test('перечитывание корня под слоем (только ревизия) — закрытие слоя всё равно движение назад', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    h.page.slots = { ...h.page.slots, main: slot(LIST0, NONE, 5) };
    h.history.changed();

    await closeLayer(h, 'side', '/');

    expect(h.port.position).toBe(0);
    expect(h.port.pushes).toBe(1);
  });

  test('вкладка пришла на запись открытия слоя: корень не менялся — закрытие идёт назад; менялся — замена без over', async () => {
    const opened = () => {
      const port = new MemoryPageHistory('/');
      port.push(
        SIDE,
        PageHistoryRecord.write(
          { main: slot(LIST0, NONE), side: slot(CARD) },
          { depth: 1, over: true },
        ),
      );
      const h = recorded(port);
      h.page.slots = { main: slot(LIST0, NONE), side: slot(CARD) };
      h.page.link = SIDE;
      h.history.traversed(h.history.traversing());
      return h;
    };
    const still = opened();
    const paged = opened();
    await toRoot(paged, LIST1, '/?page=1&_side=card', NONE);

    await closeLayer(still, 'side', '/');
    await closeLayer(paged, 'side', '/?page=1');

    expect(still.port.position).toBe(0);
    expect(paged.port.position).toBe(1);
    expect(marksOf(paged.port)).toEqual({ depth: 1, over: false });
  });

  test('over при depth 0 — запись не наша: закрытие слоя — замена, назад не идём', async () => {
    const port = new MemoryPageHistory('/');
    port.push(
      SIDE,
      PageHistoryRecord.write(
        { main: slot(LIST0, NONE), side: slot(CARD) },
        { over: true },
      ),
    );
    const h = recorded(port);
    h.page.slots = { main: slot(LIST0, NONE), side: slot(CARD) };
    h.page.link = SIDE;
    h.history.changed();

    await closeLayer(h, 'side', '/');

    expect(port.position).toBe(1);
    expect(port.pushes).toBe(1);
    expect(port.current().url).toBe('/');
    expect(Object.keys(regionsOf(port))).toEqual(['main']);
  });

  test('после закрытия слоя движением назад замены ждут конца перехода; в конце — одна, итогом', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    await closeLayer(h, 'side', '/');
    const replaces = h.port.replaces;

    h.page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    h.history.changed();
    expect(h.port.replaces).toBe(replaces);
    h.history.traversed(h.history.traversing());

    expect(h.port.replaces).toBe(replaces + 1);
    expect(h.port.position).toBe(0);
    expect(regionsOf(h.port).main).toEqual(slot(LIST0, { selected: [TASK_A] }));
  });

  test('переход из слоя на другой экран корня заменяет запись открытия: новой записи нет, over снят', async () => {
    const h = recorded();
    h.history.changed();
    await toLayer(h, 'side', CARD, SIDE);
    const pushes = h.port.pushes;

    await h.history.step(async () => {
      h.page.load('main', ASSIGNED, '/assigned');
      h.history.changed();
      await Promise.resolve();
      h.page.placed(undefined);
      h.history.changed();
      h.page.close('side', '/assigned');
      h.history.changed();
    });

    expect(h.port.pushes).toBe(pushes);
    expect(h.port.entries()).toHaveLength(2);
    expect(h.port.position).toBe(1);
    expect(h.port.current().url).toBe('/assigned');
    expect(regionsOf(h.port)).toEqual({ main: slot(ASSIGNED) });
    expect(regionsOf(h.port, 0)).toEqual({ main: slot(LIST0, NONE) });
    expect(marksOf(h.port)).toEqual({ depth: 1, over: false });
  });

  test('depth растёт на каждой новой записи и читается из записи; замена его не меняет', async () => {
    const h = recorded();
    h.history.changed();

    await toRoot(h, ASSIGNED, '/assigned');
    await toRoot(h, LIST0, '/', NONE);
    h.page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    h.history.changed();

    expect([0, 1, 2].map((at) => marksOf(h.port, at))).toEqual([
      { depth: 0, over: false },
      { depth: 1, over: false },
      { depth: 2, over: false },
    ]);
    expect(regionsOf(h.port, 2).main).toEqual(
      slot(LIST0, { selected: [TASK_A] }),
    );
  });

  test('запись, на которой вкладка загрузилась, несёт метки: замена их сохраняет, шаг продолжает счёт', async () => {
    const port = new MemoryPageHistory(
      '/',
      PageHistoryRecord.write(
        { main: slot(LIST0, NONE) },
        { depth: 3, over: true },
      ),
    );
    const h = recorded(port);
    h.page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };

    h.history.changed();
    expect(marksOf(port)).toEqual({ depth: 3, over: true });
    await toRoot(h, ASSIGNED, '/assigned');

    expect(marksOf(port)).toEqual({ depth: 4, over: false });
    expect(marksOf(port, 0)).toEqual({ depth: 3, over: true });
  });

  test('два шага сразу — по записи на каждый, по порядку первых изменений: смена экрана, затем открытие панели', async () => {
    const { port, page, history } = recorded();
    history.changed();
    const gate = Promise.withResolvers<void>();

    const first = history.step(async () => {
      await gate.promise;
      page.slots = { ...page.slots, side: slot(CARD) };
      page.link = '/assigned?_side=card';
      history.changed();
      page.slots = { ...page.slots, side: slot(CARD, undefined, 2) };
      history.changed();
    });
    const second = history.step(() => {
      page.slots = { main: slot(ASSIGNED) };
      page.link = '/assigned';
      history.changed();
    });
    gate.resolve();
    await Promise.all([first, second]);

    expect(port.pushes).toBe(2);
    expect(port.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/assigned',
      '/assigned?_side=card',
    ]);
    expect(marksOf(port)).toEqual({ depth: 2, over: true });
  });

  test('записанное двигает места сравнения: шаг вернул место, изменённое другим шагом, — тоже новая запись', async () => {
    const { port, page, history } = recorded();
    history.changed();
    const gate = Promise.withResolvers<void>();

    const first = history.step(async () => {
      await gate.promise;
      page.slots = { main: slot(ASSIGNED) };
      page.link = '/assigned';
      history.changed();
    });
    const second = history.step(async () => {
      await gate.promise;
      await Promise.resolve();
      page.slots = { main: slot(LIST0, NONE) };
      page.link = '/';
      history.changed();
    });
    gate.resolve();
    await Promise.all([first, second]);

    expect(port.pushes).toBe(2);
    expect(port.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/assigned',
      '/',
    ]);
  });

  test('отказ работы шага — промис отклонён той же причиной; следующий шаг пишет запись', async () => {
    const h = recorded();
    h.history.changed();
    const failure = new Error('код не загрузился');

    await expect(
      h.history.step(() => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await toRoot(h, ASSIGNED, '/assigned');

    expect(h.port.pushes).toBe(1);
    expect(h.port.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/assigned',
    ]);
  });
});

describe('PageHistory.traversing — начало перехода по записи', () => {
  test('идущий шаг без записи права на новую запись лишён: смена экрана перехода — замена', async () => {
    const { port, page, history } = recorded();
    history.changed();
    const gate = Promise.withResolvers<void>();

    const going = history.step(() => gate.promise);
    const generation = history.traversing();
    page.slots = { main: slot(ASSIGNED) };
    page.link = '/assigned';
    history.changed();
    history.traversed(generation);
    gate.resolve();
    await going;

    expect(port.pushes).toBe(0);
    expect(port.entries().map((entry) => entry.url)).toEqual(['/assigned']);
  });

  test('до конца перехода замены не пишутся; в конце — одна, итогом', () => {
    const { port, page, history } = recorded();
    history.changed();

    const generation = history.traversing();
    page.slots = { main: slot(LIST1, NONE) };
    page.link = '/?page=1';
    history.changed();
    expect(port.replaces).toBe(1);
    history.traversed(generation);

    expect(port.replaces).toBe(2);
    expect(regionsOf(port).main).toEqual(slot(LIST1, NONE));
  });

  test('переходы подряд: конец раннего — без записи, замена — по концу последнего', () => {
    const { port, page, history } = recorded();
    history.changed();

    const first = history.traversing();
    const last = history.traversing();
    page.slots = { main: slot(LIST1, NONE) };
    page.link = '/?page=1';
    history.traversed(first);
    expect(port.replaces).toBe(1);
    history.traversed(last);

    expect(port.replaces).toBe(2);
  });

  test('шаг, начатый во время перехода, новую запись даёт', async () => {
    const h = recorded();
    h.history.changed();

    const generation = h.history.traversing();
    await toRoot(h, ASSIGNED, '/assigned');
    h.history.traversed(generation);

    expect(h.port.pushes).toBe(1);
    expect(h.port.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/assigned',
    ]);
  });

  test('шаг снимает блок замен перехода: его замены пишутся, поздний конец вытесненного перехода — без записи', async () => {
    const h = recorded();
    h.history.changed();

    const generation = h.history.traversing();
    await toRoot(h, ASSIGNED, '/assigned');
    expect(h.port.pushes).toBe(1);
    const replaces = h.port.replaces;
    h.page.slots = { main: slot(ASSIGNED, { note: 'x' }) };
    h.history.changed();
    expect(h.port.replaces).toBe(replaces + 1);
    const written = h.port.entries();
    h.history.traversed(generation);

    expect(h.port.replaces).toBe(replaces + 1);
    expect(h.port.entries()).toEqual(written);
    expect(regionsOf(h.port).main).toEqual(slot(ASSIGNED, { note: 'x' }));
  });
});

describe('PageHistory.traversed — переход по записи', () => {
  test('после перехода по записи следующая замена пишется, даже если совпадает с записанным раньше', () => {
    const { port, history } = recorded();
    history.changed();
    expect(port.replaces).toBe(1);

    history.traversed(history.traversing());
    history.changed();

    expect(port.replaces).toBe(2);
    expect(port.pushes).toBe(0);
  });
});

describe('PageHistory — сбой порта', () => {
  test('порт бросает — onFault по разу на каждый отказанный вызов; запись не тронута', () => {
    const { port, page, history, faults } = recorded();
    history.changed();
    const written = port.entries();
    port.fail(new Error('SecurityError: https://school.example/?page=1'));

    page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    history.changed();
    expect(faults()).toBe(1);
    history.changed();

    expect(faults()).toBe(2);
    expect(port.entries()).toEqual(written);
  });

  test('сбой не обновляет отсев: после снятия сбоя то же значение записывается', () => {
    const { port, page, history, faults } = recorded();
    history.changed();
    port.fail(new Error('отказ'));
    page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    history.changed();

    port.fail(undefined);
    history.changed();

    expect(faults()).toBe(1);
    expect(regionsOf(port).main).toEqual(slot(LIST0, { selected: [TASK_A] }));
  });

  test('шаг при сбое — записи не прибавилось, вкладка работает; после снятия сбоя следующий шаг — новая запись', async () => {
    const h = recorded();
    h.history.changed();
    h.port.fail(new Error('отказ'));

    await toRoot(h, ASSIGNED, '/assigned');
    expect(h.faults()).toBeGreaterThan(0);
    expect(h.port.entries()).toHaveLength(1);
    h.port.fail(undefined);
    await toLayer(h, 'side', CARD, '/assigned?_side=card');

    expect(h.port.entries().at(-1)?.url).toBe('/assigned?_side=card');
    expect(h.port.entries()).toHaveLength(2);
  });

  test('отказанная новая запись записью шага не считается: следующее изменение того же шага — новая запись', async () => {
    const { port, page, history } = recorded();
    history.changed();
    port.fail(new Error('отказ'));

    await history.step(async () => {
      page.slots = { main: slot(ASSIGNED) };
      page.link = '/assigned';
      history.changed();
      port.fail(undefined);
      await Promise.resolve();
      page.slots = { main: slot(ASSIGNED), side: slot(CARD) };
      page.link = '/assigned?_side=card';
      history.changed();
    });

    expect(port.pushes).toBe(1);
    expect(port.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/assigned?_side=card',
    ]);
  });

  test('onFault зовётся без аргументов: ни URL, ни записи, ни броска порта', () => {
    const { port, page, history, calls } = recorded();
    port.fail(new Error('SecurityError: https://school.example/?page=1'));

    page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    history.changed();

    expect(calls).toEqual([[]]);
  });
});
