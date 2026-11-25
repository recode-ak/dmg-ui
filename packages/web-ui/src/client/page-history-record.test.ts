import { describe, expect, test } from 'bun:test';
import { ASSIGNED_ID, CARD_ID, LIST_ID, TASK_A } from 'dmg-ui/example';
import type { PageSlotJson, PageSnapshot } from './page-client.types';
import {
  PAGE_HISTORY_VERSION,
  PAGE_RECORD_LIMIT,
  PAGE_SLOT_LIMIT,
} from './page-history.const';
import { PageHistoryRecord } from './page-history-record';

// Запись истории вкладки — строка JSON `{"version":1,"regions":{…}}`: слоты
// снимка областей (адрес, ревизия, состояние) и необязательные метки: `depth`
// — сколько своих записей позади, `over` — запись положило открытие панели
// или окна. Нет меток — `depth` 0 и `over` ложь. Запись — внешние данные: чтение
// не бросает ни на каком входе и отдаёт слоты как есть — их проверяют ядро
// (`ScreenRuntime.restore`) и клиент. Пределы: слот длиннее 8192 знаков JSON
// не пишется, запись длиннее 32 768 знаков не разбирается.

const LIST_SLOT: PageSlotJson = {
  address: { screen: LIST_ID, params: { page: 1 } },
  revision: 3,
  state: { selected: [TASK_A] },
};
const CARD_SLOT: PageSlotJson = {
  address: { screen: CARD_ID, params: { taskId: TASK_A } },
  revision: 1,
};
const ASSIGNED_SLOT: PageSlotJson = {
  address: { screen: ASSIGNED_ID, params: {} },
  revision: 2,
};

/** Слот списка, JSON которого ровно `length` знаков: длину добирает строка в состоянии. */
const slotOfLength = (length: number): PageSlotJson => {
  const base = JSON.stringify({ ...LIST_SLOT, state: { filter: '' } }).length;
  return { ...LIST_SLOT, state: { filter: 'ф'.repeat(length - base) } };
};

/** Запись с основной областью, добранная строкой в состоянии до `length` знаков. */
const recordOfLength = (length: number): string => {
  const record = (filter: string) =>
    JSON.stringify({
      version: 1,
      regions: { main: { ...LIST_SLOT, state: { filter } } },
    });
  return record('я'.repeat(length - record('').length));
};

describe('PageHistoryRecord — запись и чтение', () => {
  test.each([
    ['один слот', { main: LIST_SLOT }],
    ['два слота', { main: LIST_SLOT, side: CARD_SLOT }],
    ['три слота', { main: LIST_SLOT, side: CARD_SLOT, modal: ASSIGNED_SLOT }],
  ] as const)('%s: чтение записанного отдаёт те же слоты', (_, snapshot) => {
    const record = PageHistoryRecord.write(snapshot);

    expect(PageHistoryRecord.read(record)).toStrictEqual(snapshot);
  });

  test('запись — строка JSON с версией 1 и слотами под regions', () => {
    const record = PageHistoryRecord.write({ main: LIST_SLOT });

    expect(typeof record).toBe('string');
    expect(JSON.parse(record)).toStrictEqual({
      version: 1,
      regions: { main: LIST_SLOT },
    });
    expect(PAGE_HISTORY_VERSION).toBe(1);
  });

  test('пустой снимок — запись без слотов', () => {
    expect(PageHistoryRecord.write({})).toBe('{"version":1,"regions":{}}');
    expect(PageHistoryRecord.read('{"version":1,"regions":{}}')).toEqual({});
  });

  test('пределы: слот — 8192 знака JSON, запись — 32 768', () => {
    expect(PAGE_SLOT_LIMIT).toBe(8192);
    expect(PAGE_RECORD_LIMIT).toBe(32768);
  });

  test('слот длиннее предела не записан, остальные записаны; запись не длиннее предела записи', () => {
    const long = slotOfLength(PAGE_SLOT_LIMIT + 1);
    expect(JSON.stringify(long)).toHaveLength(PAGE_SLOT_LIMIT + 1);

    const record = PageHistoryRecord.write({
      main: long,
      side: CARD_SLOT,
      modal: ASSIGNED_SLOT,
    });

    expect(PageHistoryRecord.read(record)).toStrictEqual({
      side: CARD_SLOT,
      modal: ASSIGNED_SLOT,
    });
    expect(record.length).toBeLessThanOrEqual(PAGE_RECORD_LIMIT);
  });

  test('слот ровно в предел записан', () => {
    const edge = slotOfLength(PAGE_SLOT_LIMIT);
    expect(JSON.stringify(edge)).toHaveLength(PAGE_SLOT_LIMIT);

    const record = PageHistoryRecord.write({ main: edge });

    expect(PageHistoryRecord.read(record)).toStrictEqual({ main: edge });
  });

  test('три слота ровно в предел — запись не длиннее предела записи', () => {
    const edge = slotOfLength(PAGE_SLOT_LIMIT);
    const snapshot: PageSnapshot = { main: edge, side: edge, modal: edge };

    const record = PageHistoryRecord.write(snapshot);

    expect(record.length).toBeLessThanOrEqual(PAGE_RECORD_LIMIT);
    expect(PageHistoryRecord.read(record)).toStrictEqual(snapshot);
  });
});

describe('PageHistoryRecord.read — внешние данные', () => {
  const valid = PageHistoryRecord.write({ main: LIST_SLOT });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['число', 42],
    ['булево', true],
    ['объект нужной формы, а не строка', JSON.parse(valid)],
    ['массив', [valid]],
    ['пустая строка', ''],
    ['обрывок JSON', '{'],
    ['не JSON', 'мусор'],
    ['массив JSON', '[]'],
    ['строка JSON', '"x"'],
    ['число JSON', '42'],
    ['null JSON', 'null'],
    ['версия 2', JSON.stringify({ version: 2, regions: { main: LIST_SLOT } })],
    [
      'версия строкой',
      JSON.stringify({ version: '1', regions: { main: LIST_SLOT } }),
    ],
    ['без версии', JSON.stringify({ regions: { main: LIST_SLOT } })],
    ['без слотов', JSON.stringify({ version: 1 })],
    ['слоты массивом', JSON.stringify({ version: 1, regions: [LIST_SLOT] })],
    ['слоты null', JSON.stringify({ version: 1, regions: null })],
    ['слоты строкой', JSON.stringify({ version: 1, regions: 'main' })],
  ])('%s — пустой набор, без броска', (_, record) => {
    expect(PageHistoryRecord.read(record)).toEqual({});
  });

  test('запись ровно в предел разбирается', () => {
    const record = recordOfLength(PAGE_RECORD_LIMIT);
    expect(record).toHaveLength(PAGE_RECORD_LIMIT);

    expect(Object.keys(PageHistoryRecord.read(record))).toEqual(['main']);
  });

  test('запись длиннее предела — пустой набор, хотя JSON годный', () => {
    const record = recordOfLength(PAGE_RECORD_LIMIT + 1);
    expect(record).toHaveLength(PAGE_RECORD_LIMIT + 1);
    expect(() => JSON.parse(record)).not.toThrow();

    expect(PageHistoryRecord.read(record)).toEqual({});
  });

  test('очень длинная строка — пустой набор, без броска', () => {
    expect(PageHistoryRecord.read('{'.repeat(1_000_000))).toEqual({});
  });

  test('ключ __proto__ в слотах отброшен: ни своего ключа, ни области через прототип; Object.prototype не тронут', () => {
    const record = `{"version":1,"regions":{"__proto__":{"modal":${JSON.stringify(LIST_SLOT)}}}}`;

    const slots = PageHistoryRecord.read(record);

    expect(Object.keys(slots)).toEqual([]);
    expect(slots.modal).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, 'modal')).toBe(false);
  });

  test('глубокая вложенность внутри слота в пределе — без броска, слот как есть', () => {
    const depth = 16365;
    const record = `{"version":1,"regions":{"main":${'['.repeat(depth)}${']'.repeat(depth)}}}`;
    expect(record.length).toBeLessThanOrEqual(PAGE_RECORD_LIMIT);

    expect(Object.keys(PageHistoryRecord.read(record))).toEqual(['main']);
  });

  test('ревизия вне чисел JSON (1e309) — слот отдан как есть, его отвергнет ядро', () => {
    const record = `{"version":1,"regions":{"main":{"address":${JSON.stringify(LIST_SLOT.address)},"revision":1e309}}}`;

    expect(PageHistoryRecord.read(record)).toEqual({
      main: { address: LIST_SLOT.address, revision: Number.POSITIVE_INFINITY },
    });
  });

  test('слоты как есть: чужие ключи областей и слоты не той формы возвращаются', () => {
    const regions = {
      main: 42,
      side: { address: 'мусор', revision: -1 },
      modal: { address: { screen: 'нет/такого', params: {} }, revision: 1 },
      nowhere: LIST_SLOT,
    };

    expect(
      PageHistoryRecord.read(JSON.stringify({ version: 1, regions })),
    ).toStrictEqual(regions);
  });
});

describe('PageHistoryRecord — метки depth и over', () => {
  const MARKS = { depth: 2, over: true };
  const DEFAULT = { depth: 0, over: false };

  test('метки пишутся рядом со слотами и читаются обратно; версия остаётся 1', () => {
    const record = PageHistoryRecord.write({ main: LIST_SLOT }, MARKS);

    expect(JSON.parse(record)).toMatchObject({
      version: 1,
      regions: { main: LIST_SLOT },
      depth: 2,
      over: true,
    });
    expect(PageHistoryRecord.marks(record)).toEqual(MARKS);
    expect(PageHistoryRecord.read(record)).toStrictEqual({ main: LIST_SLOT });
  });

  test('глубина без открытия слоя — over ложь', () => {
    const record = PageHistoryRecord.write(
      { main: LIST_SLOT },
      { depth: 5, over: false },
    );

    expect(PageHistoryRecord.marks(record)).toEqual({ depth: 5, over: false });
  });

  test('запись без меток — depth 0, over ложь; слоты читаются как прежде', () => {
    const record = PageHistoryRecord.write({ main: LIST_SLOT });

    expect(PageHistoryRecord.marks(record)).toEqual(DEFAULT);
    expect(PageHistoryRecord.read(record)).toStrictEqual({ main: LIST_SLOT });
  });

  test('запись прежней формы, без полей меток, — метки по умолчанию', () => {
    const record = '{"version":1,"regions":{}}';

    expect(PageHistoryRecord.marks(record)).toEqual(DEFAULT);
  });

  test.each([
    [
      'depth отрицательный',
      { depth: -1, over: true },
      { depth: 0, over: true },
    ],
    ['depth дробный', { depth: 1.5, over: true }, { depth: 0, over: true }],
    ['depth строкой', { depth: '2', over: true }, { depth: 0, over: true }],
    ['depth null', { depth: null, over: true }, { depth: 0, over: true }],
    ['over строкой', { depth: 2, over: 'true' }, { depth: 2, over: false }],
    ['over числом', { depth: 2, over: 1 }, { depth: 2, over: false }],
    ['over null', { depth: 2, over: null }, { depth: 2, over: false }],
  ])('%s — по умолчанию, без броска', (_, extra, expected) => {
    const record = JSON.stringify({ version: 1, regions: {}, ...extra });

    expect(PageHistoryRecord.marks(record)).toEqual(expected);
  });

  test.each([
    ['undefined', undefined],
    ['null', null],
    ['число', 42],
    ['объект нужной формы, а не строка', { version: 1, regions: {}, depth: 3 }],
    ['пустая строка', ''],
    ['обрывок JSON', '{'],
    ['не JSON', 'мусор'],
    ['массив JSON', '[]'],
    [
      'версия 2 с метками',
      JSON.stringify({ version: 2, regions: {}, depth: 3, over: true }),
    ],
  ])(
    'запись не читается (%s) — метки по умолчанию, без броска',
    (_, record) => {
      expect(PageHistoryRecord.marks(record)).toEqual(DEFAULT);
    },
  );

  test('запись длиннее предела — метки по умолчанию', () => {
    const record = recordOfLength(PAGE_RECORD_LIMIT + 1).replace(
      '{"version":1,',
      '{"version":1,"depth":3,"over":true,',
    );

    expect(PageHistoryRecord.marks(record)).toEqual(DEFAULT);
  });

  test('мусор в метках слоты не отнимает: чтение отдаёт их как есть', () => {
    const record = JSON.stringify({
      version: 1,
      regions: { main: LIST_SLOT },
      depth: 'много',
      over: 'да',
    });

    expect(PageHistoryRecord.marks(record)).toEqual(DEFAULT);
    expect(PageHistoryRecord.read(record)).toStrictEqual({ main: LIST_SLOT });
  });
});
