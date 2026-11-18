import { describe, expect, test } from 'bun:test';
import type { AddressJson } from 'dmg-ui';
import { CARD_ID, LIST_ID, TASK_A } from 'dmg-ui/testing';
import { MemoryPageHistory } from '../../testing';
import type { PageSlotJson, PageSnapshot } from './page-client.types';
import { PageHistory } from './page-history';
import type { PageHistoryPage } from './page-history.types';
import { PageHistoryRecord } from './page-history-record';

// Правило записей истории поверх порта: шаг (новая запись) начинает клиент
// там, где начинается переход, — первое изменение адресов областей в ходе
// шага даёт `push`, всё следующее до его конца — замена той же записи. Вне
// шага текущая запись переписывается при изменении адресов или состояния
// (ревизия не в счёт), но не пока область грузится и не без ссылки. Страница
// здесь — подставной объект: адреса, снимок, ссылка и загрузка задаются
// тестом; порт — подставная история.

const LIST0: AddressJson = { screen: LIST_ID, params: { page: 0 } };
const LIST1: AddressJson = { screen: LIST_ID, params: { page: 1 } };
const CARD: AddressJson = { screen: CARD_ID, params: { taskId: TASK_A } };

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

  /** Область начала грузиться по адресу: экземпляра в ней нет, адрес есть. */
  load(region: 'main' | 'side', address: AddressJson, link: string): void {
    const { [region]: _gone, ...rest } = this.slots;
    this.slots = rest;
    this.opening = { region, address };
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
const recorded = () => {
  const port = new MemoryPageHistory('/');
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
  test('до работы — замена уходящего; первое изменение адресов — новая запись; следующее до конца шага — замена той же', async () => {
    const { port, page, history } = recorded();
    history.changed();
    page.slots = { main: slot(LIST0, { selected: [TASK_A] }) };
    let before: unknown;

    await history.step(async () => {
      before = regionsOf(port).main;
      page.load('main', LIST1, '/?page=1');
      history.changed();
      expect(port.pushes).toBe(1);
      await Promise.resolve();
      page.placed(NONE);
      history.changed();
    });

    expect(before).toEqual(slot(LIST0, { selected: [TASK_A] }));
    expect(port.pushes).toBe(1);
    expect(port.entries().map((entry) => entry.url)).toEqual(['/', '/?page=1']);
    expect(regionsOf(port, 0)).toEqual({
      main: slot(LIST0, { selected: [TASK_A] }),
    });
    expect(regionsOf(port, 1)).toEqual({ main: slot(LIST1, NONE) });
  });

  test('запись шага кладётся на первом изменении адресов: грузящейся области в ней нет', async () => {
    const { port, page, history } = recorded();
    history.changed();
    let pushed: unknown;

    await history.step(async () => {
      page.load('main', LIST1, '/?page=1');
      history.changed();
      pushed = port.entries()[1];
      await Promise.resolve();
      page.placed(NONE);
      history.changed();
    });

    expect(pushed).toEqual({
      url: '/?page=1',
      record: PageHistoryRecord.write({}),
    });
  });

  test('шаг без изменения адресов — только замена, новых записей нет', async () => {
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

  test('изменение адресов только после await в работе шага — всё равно новая запись', async () => {
    const { port, page, history } = recorded();
    page.slots = { main: slot(LIST0, NONE), modal: slot(CARD) };
    history.changed();

    await history.step(async () => {
      page.load('main', LIST0, '/');
      history.changed();
      await Promise.resolve();
      page.placed(NONE);
      history.changed();
      await Promise.resolve();
      page.slots = { main: slot(LIST0, NONE) };
      history.changed();
    });

    expect(port.pushes).toBe(1);
    expect(Object.keys(regionsOf(port, 0)).sort()).toEqual(['main', 'modal']);
    expect(Object.keys(regionsOf(port, 1))).toEqual(['main']);
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

  test('после конца шага изменение адресов — замена, а не новая запись', async () => {
    const { port, page, history } = recorded();
    history.changed();
    await history.step(() => undefined);

    page.slots = { main: slot(LIST1, NONE) };
    page.link = '/?page=1';
    history.changed();

    expect(port.pushes).toBe(0);
    expect(port.entries().map((entry) => entry.url)).toEqual(['/?page=1']);
  });

  test('два шага сразу — по записи на каждый, по порядку первых изменений', async () => {
    const { port, page, history } = recorded();
    history.changed();
    const gate = Promise.withResolvers<void>();

    const first = history.step(async () => {
      await gate.promise;
      page.slots = { ...page.slots, side: slot(CARD) };
      page.link = '/?page=1&_side=card';
      history.changed();
      page.slots = { ...page.slots, side: slot(CARD, undefined, 2) };
      history.changed();
    });
    const second = history.step(() => {
      page.slots = { main: slot(LIST1, NONE) };
      page.link = '/?page=1';
      history.changed();
    });
    gate.resolve();
    await Promise.all([first, second]);

    expect(port.pushes).toBe(2);
    expect(port.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/?page=1',
      '/?page=1&_side=card',
    ]);
  });

  test('записанное двигает адреса сравнения: шаг вернул адреса, изменённые другим шагом, — тоже новая запись', async () => {
    const { port, page, history } = recorded();
    history.changed();
    const gate = Promise.withResolvers<void>();

    const first = history.step(async () => {
      await gate.promise;
      page.slots = { main: slot(LIST1, NONE) };
      page.link = '/?page=1';
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
      '/?page=1',
      '/',
    ]);
  });

  test('отказ работы шага — промис отклонён той же причиной; следующий шаг пишет запись', async () => {
    const { port, page, history } = recorded();
    history.changed();
    const failure = new Error('код не загрузился');

    await expect(
      history.step(() => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await history.step(() => {
      page.slots = { main: slot(LIST1, NONE) };
      page.link = '/?page=1';
      history.changed();
    });

    expect(port.pushes).toBe(1);
    expect(port.entries().map((entry) => entry.url)).toEqual(['/', '/?page=1']);
  });
});

describe('PageHistory.traversing — начало перехода по записи', () => {
  test('идущий шаг без записи права на новую запись лишён: изменения перехода — замена', async () => {
    const { port, page, history } = recorded();
    history.changed();
    const gate = Promise.withResolvers<void>();

    const going = history.step(() => gate.promise);
    const generation = history.traversing();
    page.slots = { main: slot(LIST1, NONE) };
    page.link = '/?page=1';
    history.changed();
    history.traversed(generation);
    gate.resolve();
    await going;

    expect(port.pushes).toBe(0);
    expect(port.entries().map((entry) => entry.url)).toEqual(['/?page=1']);
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
    const { port, page, history } = recorded();
    history.changed();

    const generation = history.traversing();
    await history.step(() => {
      page.slots = { main: slot(LIST1, NONE) };
      page.link = '/?page=1';
      history.changed();
    });
    history.traversed(generation);

    expect(port.pushes).toBe(1);
    expect(port.entries().map((entry) => entry.url)).toEqual(['/', '/?page=1']);
  });

  test('шаг снимает блок замен перехода: его замены пишутся, поздний конец вытесненного перехода — без записи', async () => {
    const { port, page, history } = recorded();
    history.changed();

    const generation = history.traversing();
    await history.step(() => {
      page.slots = { main: slot(LIST1, NONE) };
      page.link = '/?page=1';
      history.changed();
    });
    expect(port.pushes).toBe(1);
    const replaces = port.replaces;
    page.slots = { main: slot(LIST1, { selected: [TASK_A] }) };
    history.changed();
    expect(port.replaces).toBe(replaces + 1);
    const written = port.entries();
    history.traversed(generation);

    expect(port.replaces).toBe(replaces + 1);
    expect(port.entries()).toEqual(written);
    expect(regionsOf(port).main).toEqual(slot(LIST1, { selected: [TASK_A] }));
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
    const { port, page, history, faults } = recorded();
    history.changed();
    port.fail(new Error('отказ'));

    await history.step(() => {
      page.slots = { main: slot(LIST1, NONE) };
      page.link = '/?page=1';
      history.changed();
    });
    expect(faults()).toBeGreaterThan(0);
    expect(port.entries()).toHaveLength(1);
    port.fail(undefined);
    await history.step(() => {
      page.slots = { main: slot(LIST1, NONE), side: slot(CARD) };
      page.link = '/?page=1&_side=card';
      history.changed();
    });

    expect(port.entries().at(-1)?.url).toBe('/?page=1&_side=card');
    expect(port.entries()).toHaveLength(2);
  });

  test('отказанная новая запись записью шага не считается: следующее изменение адресов того же шага — новая запись', async () => {
    const { port, page, history } = recorded();
    history.changed();
    port.fail(new Error('отказ'));

    await history.step(async () => {
      page.slots = { main: slot(LIST1, NONE) };
      page.link = '/?page=1';
      history.changed();
      port.fail(undefined);
      await Promise.resolve();
      page.slots = { main: slot(LIST1, NONE), side: slot(CARD) };
      page.link = '/?page=1&_side=card';
      history.changed();
    });

    expect(port.pushes).toBe(1);
    expect(port.entries().map((entry) => entry.url)).toEqual([
      '/',
      '/?page=1&_side=card',
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
