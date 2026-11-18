import { describe, expect, test } from 'bun:test';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import { ScreenDef, UiIds } from 'dmg-ui';
import {
  ASSIGNED_ID,
  AssignedTasksScreenDef,
  CARD_ID,
  ExampleUiSetDef,
  LIST_ID,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import * as v from 'valibot';
import type { PagePlacement, PageRegionName } from './page-client.types';
import { PagePlacements } from './page-placements';

// Куда открыть переход: чистая функция положения источника, экрана на месте
// и экрана назначения. Правила по порядку — тот же экран на месте; экран
// объявлен приложением страниц — в его область; иначе умолчание по
// положению: из основной — в боковую, из боковой и модальной — в основную,
// ссылка без положения — в боковую.

const placements = (list: readonly PagePlacement[]) =>
  new PagePlacements(new UiIds(ExampleUiSetDef), list);

const CARD_IN_MODAL: readonly PagePlacement[] = [
  { screen: TaskCardScreenDef, region: 'modal' },
];
const LIST_IN_MAIN: readonly PagePlacement[] = [
  { screen: TaskListScreenDef, region: 'main' },
];

const REGIONS: readonly PageRegionName[] = ['main', 'side', 'modal'];

describe('PagePlacements.target — без объявлений: умолчание по положению', () => {
  test.each([
    ['main', LIST_ID, CARD_ID, 'side'],
    ['side', CARD_ID, LIST_ID, 'main'],
    ['modal', CARD_ID, LIST_ID, 'main'],
    ['main', undefined, ASSIGNED_ID, 'side'],
    ['side', undefined, ASSIGNED_ID, 'main'],
  ] as const)(
    'из %s (экран %s) на %s — в %s',
    (from, current, screen, expected) => {
      expect(placements([]).target(from, current, screen)).toBe(expected);
    },
  );

  test('ссылка без положения (from не задан) — в боковую', () => {
    expect(placements([]).target(undefined, undefined, CARD_ID)).toBe('side');
    expect(placements([]).target(undefined, undefined, LIST_ID)).toBe('side');
  });

  test('неизвестный экран — то же умолчание, без отказа', () => {
    const target = (from: PageRegionName | undefined) =>
      placements([]).target(from, LIST_ID, 'нет/такого/экрана');

    expect(target('main')).toBe('side');
    expect(target('side')).toBe('main');
    expect(target('modal')).toBe('main');
    expect(target(undefined)).toBe('side');
  });
});

describe('PagePlacements.target — тот же экран остаётся на месте', () => {
  test.each(REGIONS)(
    'из %s: current равен экрану — область не меняется',
    (from) => {
      expect(placements([]).target(from, CARD_ID, CARD_ID)).toBe(from);
    },
  );

  test.each(REGIONS)(
    'из %s: экран объявлен в другой области — на месте всё равно',
    (from) => {
      expect(placements(CARD_IN_MODAL).target(from, CARD_ID, CARD_ID)).toBe(
        from,
      );
      expect(placements(LIST_IN_MAIN).target(from, LIST_ID, LIST_ID)).toBe(
        from,
      );
    },
  );
});

describe('PagePlacements.target — экран объявлен приложением страниц', () => {
  test('карточка в окне: из основной, из боковой и из ссылки — в окно', () => {
    const target = placements(CARD_IN_MODAL);

    expect(target.target('main', LIST_ID, CARD_ID)).toBe('modal');
    expect(target.target('side', ASSIGNED_ID, CARD_ID)).toBe('modal');
    expect(target.target(undefined, undefined, CARD_ID)).toBe('modal');
  });

  test('карточка в окне: из окна на другой экран — в окно (замена на месте)', () => {
    expect(
      placements(CARD_IN_MODAL).target('modal', ASSIGNED_ID, CARD_ID),
    ).toBe('modal');
  });

  test('карточка в окне: переходы на прочие экраны — по умолчанию', () => {
    const target = placements(CARD_IN_MODAL);

    expect(target.target('main', LIST_ID, ASSIGNED_ID)).toBe('side');
    expect(target.target('modal', CARD_ID, LIST_ID)).toBe('main');
  });

  test('список в основной: из боковой и из окна — в основную', () => {
    const target = placements(LIST_IN_MAIN);

    expect(target.target('side', CARD_ID, LIST_ID)).toBe('main');
    expect(target.target('modal', CARD_ID, LIST_ID)).toBe('main');
    expect(target.target('main', ASSIGNED_ID, LIST_ID)).toBe('main');
  });

  test('список в боковой: из окна и из ссылки — в боковую, а не по умолчанию в основную', () => {
    const target = placements([{ screen: TaskListScreenDef, region: 'side' }]);

    expect(target.target('modal', CARD_ID, LIST_ID)).toBe('side');
    expect(target.target('main', ASSIGNED_ID, LIST_ID)).toBe('side');
    expect(target.target(undefined, undefined, LIST_ID)).toBe('side');
  });

  test('несколько объявлений — у каждого экрана своя область', () => {
    const target = placements([
      { screen: TaskCardScreenDef, region: 'modal' },
      { screen: AssignedTasksScreenDef, region: 'side' },
    ]);

    expect(target.target('main', LIST_ID, CARD_ID)).toBe('modal');
    expect(target.target('main', LIST_ID, ASSIGNED_ID)).toBe('side');
    expect(target.target('modal', CARD_ID, ASSIGNED_ID)).toBe('side');
  });
});

describe('PagePlacements — сборка', () => {
  const Stray = ScreenDef.define({
    name: 'stray',
    label: 'Чужой',
    description: 'Экран вне набора.',
    reads: [ListTasksUcDef],
    data: v.object({}),
  });

  test('экран вне набора — бросок сборки с именем класса клиента', () => {
    expect(() => placements([{ screen: Stray, region: 'side' }])).toThrow(
      'PageClient:',
    );
  });

  test('один экран дважды — бросок сборки, даже с одной областью', () => {
    expect(() =>
      placements([
        { screen: TaskCardScreenDef, region: 'modal' },
        { screen: TaskCardScreenDef, region: 'modal' },
      ]),
    ).toThrow('PageClient:');
    expect(() =>
      placements([
        { screen: TaskCardScreenDef, region: 'modal' },
        { screen: TaskCardScreenDef, region: 'side' },
      ]),
    ).toThrow('PageClient:');
  });

  test('пустое и верное объявление собираются', () => {
    expect(() => placements([])).not.toThrow();
    expect(() => placements(CARD_IN_MODAL)).not.toThrow();
  });
});

describe('PagePlacements.target — контракты', () => {
  test('правило «тот же экран» действует только при заданном from: ссылка идёт в боковую', () => {
    expect(placements([]).target(undefined, CARD_ID, CARD_ID)).toBe('side');
    expect(placements(CARD_IN_MODAL).target(undefined, LIST_ID, LIST_ID)).toBe(
      'side',
    );
  });

  test('область вне перечня в объявлении (вызов из JS) — бросок сборки', () => {
    const foreign = { screen: TaskCardScreenDef, region: 'нет' } as never;

    expect(() => placements([foreign])).toThrow('PageClient:');
  });

  test('экран вне набора — бросок с исходной причиной', () => {
    const Stray = ScreenDef.define({
      name: 'stray',
      label: 'Чужой',
      description: 'Экран вне набора.',
      reads: [ListTasksUcDef],
      data: v.object({}),
    });
    let caught: unknown;

    try {
      placements([{ screen: Stray, region: 'side' }]);
    } catch (error) {
      caught = error;
    }

    expect((caught as Error).cause).toBeInstanceOf(Error);
  });
});
