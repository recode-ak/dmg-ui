import { describe, expect, test } from 'bun:test';
import { err, ok } from 'dmg-core';
import type { InstanceView } from 'dmg-ui';
import { CARD_ID, TASK_A } from 'dmg-ui/testing';
import * as v from 'valibot';
import { PAGE_CHANNEL } from '../page-channel.const';
import type { PageViewState } from '../view/page-view-state.types';
import { PAGE_FAULTS } from './page-client.const';
import { PageOverlay } from './page-overlay';
import type { PageOverlayCheck } from './page-overlay.types';
import { ViewCell } from './view-cell';

// Наложение ожидаемого итога — производный источник поверх источника
// области. Без живых наложений отдаёт тот же объект, что источник; с
// наложением — данные вида из итога функции после проверки, `expected: true`,
// прочее — от источника. Наложение живо, пока область готова той же ревизии
// без пометки устаревания и `holds()` истинно; умершее не оживает. Источник —
// ячейка, проверка — подставная функция, сбои — журнал.

const CARD = { screen: CARD_ID, params: { taskId: TASK_A } };
const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};
const DATA = { uuid: TASK_A, title: 'Хлеб', status: 'open' };

/** Вид карточки ревизии `revision`. */
const viewAt = (revision: number, data: unknown = DATA): InstanceView => ({
  screen: CARD_ID,
  address: CARD,
  revision,
  status: 'ready',
  data,
  state: { mark: 'состояние экрана' },
  context: CONTEXT,
  actions: [
    { name: 'complete', availability: { kind: 'available' }, fields: [] },
  ],
  locals: [],
});

/** Готовая область ревизии `revision`; отметки — поверх. */
const readyAt = (
  revision: number,
  marks: Partial<PageViewState> = {},
): PageViewState => ({
  status: 'ready',
  address: CARD,
  view: viewAt(revision),
  refreshing: false,
  issues: [],
  ...marks,
});

const Row = v.object({
  uuid: v.string(),
  title: v.string(),
  status: v.picklist(['open', 'done']),
});

/** Проверка по схеме строки: выход — новый объект без лишних ключей. */
const byRow: PageOverlayCheck = (_view, data) => {
  const parsed = v.safeParse(Row, data);
  return parsed.success ? ok(parsed.output) : err(undefined);
};

type Fault = { readonly node: string; readonly error: unknown };

/** Источник-ячейка, наложение над ним, журнал сбоев и журнал значений. */
const overlaid = (
  initial: PageViewState = readyAt(1),
  check: PageOverlayCheck = byRow,
) => {
  const base = new ViewCell<PageViewState>(initial);
  const faults: Fault[] = [];
  const overlay = new PageOverlay(base, check, (node, error) => {
    faults.push({ node, error });
  });
  const log: PageViewState[] = [];
  overlay.subscribe((state) => {
    log.push(state);
  });
  return { base, overlay, faults, log };
};

/** Итог «выполнена» поверх данных вида. */
const done = (view: InstanceView) => ({
  ...v.parse(Row, view.data),
  status: 'done',
});

/** Итог с новым названием поверх данных вида. */
const renamed = (view: InstanceView) => ({
  ...v.parse(Row, view.data),
  title: 'Батон',
});

const always = () => true;

describe('PageOverlay — без наложений', () => {
  test('get — тот же объект, что у источника; подписка сразу получает его же', () => {
    const { base, overlay, log } = overlaid();

    expect(overlay.get()).toBe(base.get());
    expect(log).toHaveLength(1);
    expect(log[0]).toBe(base.get());
    expect(overlay.expecting()).toBe(false);
  });

  test('новое значение источника — тот же объект у наложения и слушателя', () => {
    const { base, overlay, log } = overlaid();
    const next = readyAt(2, { note: 'Данные обновились' });

    base.set(next);

    expect(overlay.get()).toBe(next);
    expect(log).toHaveLength(2);
    expect(log[1]).toBe(next);
  });
});

describe('PageOverlay — наложение и снятие', () => {
  test('наложение: данные вида — выход проверки, expected; прочее — от источника', () => {
    const initial = readyAt(1, {
      refreshing: true,
      note: 'Заметка',
      issues: [{ field: 'title', text: 'Пусто' }],
      confirm: {
        action: 'complete',
        label: 'Точно?',
        description: 'Насовсем.',
      },
      entered: { kind: 'action', name: 'assign', values: { assigneeId: 'x' } },
    });
    const check: PageOverlayCheck = (_view, data) => {
      const parsed = v.safeParse(Row, data);
      return parsed.success
        ? ok({ ...parsed.output, title: 'проверено' })
        : err(undefined);
    };
    const { base, overlay, log } = overlaid(initial, check);

    overlay.put(1, done, always);

    const shown = overlay.get();
    expect(shown).not.toBe(base.get());
    expect(shown.expected).toBe(true);
    expect(shown.view?.data).toEqual({
      uuid: TASK_A,
      title: 'проверено',
      status: 'done',
    });
    expect(shown.status).toBe('ready');
    expect(shown.address).toEqual(initial.address);
    expect(shown.view?.screen).toBe(CARD_ID);
    expect(shown.view?.address).toEqual(CARD);
    expect(shown.view?.revision).toBe(1);
    expect(shown.view?.status).toBe('ready');
    expect(shown.view?.actions).toEqual(initial.view?.actions ?? []);
    expect(shown.view?.state).toEqual(initial.view?.state);
    expect(shown.view?.context).toEqual(CONTEXT);
    expect(shown.refreshing).toBe(true);
    expect(shown.note).toBe('Заметка');
    expect(shown.issues).toEqual(initial.issues);
    expect(shown.confirm).toEqual(initial.confirm);
    expect(shown.entered).toEqual(initial.entered);
    expect(log).toHaveLength(2);
    expect(log[1]).toBe(shown);
    expect(overlay.expecting()).toBe(true);
  });

  test('источник не меняется: его значение и данные прежние', () => {
    const { base, overlay } = overlaid();
    const before = base.get();
    const json = JSON.stringify(before);

    overlay.put(1, done, always);

    expect(base.get()).toBe(before);
    expect(JSON.stringify(before)).toBe(json);
  });

  test('снятие — снова объект источника; повторное снятие без рассылки', () => {
    const { base, overlay, log } = overlaid();
    const off = overlay.put(1, done, always);

    off();

    expect(overlay.get()).toBe(base.get());
    expect(overlay.expecting()).toBe(false);
    expect(log).toHaveLength(3);
    expect(log[2]).toBe(base.get());
    off();
    expect(log).toHaveLength(3);
  });

  test('ревизия не та при постановке — наложение не видно, expecting ложно', () => {
    const { base, overlay, log } = overlaid();

    overlay.put(2, done, always);

    expect(overlay.get()).toBe(base.get());
    expect(overlay.expecting()).toBe(false);
    expect(log.some((state) => state.expected === true)).toBe(false);
  });

  test('итог функции не трогает вход: функция получает вид с данными источника', () => {
    const { overlay } = overlaid();
    const seen: unknown[] = [];

    overlay.put(
      1,
      (view) => {
        seen.push(view.data);
        return done(view);
      },
      always,
    );

    expect(seen[0]).toEqual(DATA);
  });
});

describe('PageOverlay — наложение умирает навсегда', () => {
  test('ревизия выросла — снято; источник вернулся к прежней ревизии — не оживает', () => {
    const { base, overlay } = overlaid();
    overlay.put(1, done, always);

    base.set(readyAt(2));

    expect(overlay.get()).toBe(base.get());
    expect(overlay.expecting()).toBe(false);
    base.set(readyAt(1));
    expect(overlay.get()).toBe(base.get());
    expect(overlay.get().expected).toBeUndefined();
  });

  test.each<[string, PageViewState]>([
    [
      'loading',
      { status: 'loading', address: CARD, refreshing: false, issues: [] },
    ],
    ['empty', { status: 'empty', refreshing: false, issues: [] }],
    [
      'refused',
      {
        status: 'refused',
        address: CARD,
        view: {
          ...viewAt(1),
          status: 'refused',
          data: undefined,
          refusal: {
            code: 'ACCESS_DENIED',
            text: 'Нет доступа',
            caught: false,
          },
          actions: [],
        },
        refreshing: false,
        issues: [],
      },
    ],
    ['stale: offline', readyAt(1, { stale: 'offline' })],
    ['stale: revision', readyAt(1, { stale: 'revision' })],
  ])(
    '%s — снято без сбоя; та же ревизия снова готова — не оживает',
    (_name, state) => {
      const { base, overlay, faults } = overlaid();
      overlay.put(1, done, always);

      base.set(state);

      expect(overlay.get()).toBe(state);
      expect(overlay.expecting()).toBe(false);
      const back = readyAt(1);
      base.set(back);
      expect(overlay.get()).toBe(back);
      expect(overlay.expecting()).toBe(false);
      expect(faults).toEqual([]);
    },
  );

  test('holds ложно — снято при следующем пересчёте; снова истинно — не оживает', () => {
    const { base, overlay } = overlaid();
    let holds = true;
    overlay.put(1, done, () => holds);

    holds = false;
    const marked = readyAt(1, { note: 'Заметка' });
    base.set(marked);

    expect(overlay.get()).toBe(marked);
    expect(overlay.expecting()).toBe(false);
    holds = true;
    const again = readyAt(1, { note: 'Ещё заметка' });
    base.set(again);
    expect(overlay.get()).toBe(again);
    expect(overlay.expecting()).toBe(false);
  });
});

describe('PageOverlay — наложение держится', () => {
  test('refreshing, новая заметка и замечания у источника той же ревизии — наложение держится, отметки новые', () => {
    const { base, overlay } = overlaid();
    overlay.put(1, done, always);

    base.set(
      readyAt(1, {
        refreshing: true,
        note: 'Новая заметка',
        issues: [{ text: 'Общее замечание' }],
      }),
    );

    expect(overlay.get()).toMatchObject({
      expected: true,
      refreshing: true,
      note: 'Новая заметка',
      issues: [{ text: 'Общее замечание' }],
    });
    expect(overlay.get().view?.data).toMatchObject({ status: 'done' });
    expect(overlay.expecting()).toBe(true);
  });

  test('два наложения: вторая функция получает итог первой; снятие первого — вторая поверх источника', () => {
    const { base, overlay } = overlaid();
    const seen: unknown[] = [];
    const first = overlay.put(1, done, always);

    overlay.put(
      1,
      (view) => {
        seen.push(view.data);
        return renamed(view);
      },
      always,
    );

    expect(seen.at(-1)).toEqual({ ...DATA, status: 'done' });
    expect(overlay.get().view?.data).toEqual({
      uuid: TASK_A,
      title: 'Батон',
      status: 'done',
    });
    first();
    expect(overlay.get().view?.data).toEqual({ ...DATA, title: 'Батон' });
    expect(overlay.get().expected).toBe(true);
    expect(overlay.get()).not.toBe(base.get());
  });
});

describe('PageOverlay — сбой итога', () => {
  test('проверка отказала — наложения нет, сбой один раз фиксированным текстом; прежнее наложение живо', () => {
    const { base, overlay, faults } = overlaid();
    overlay.put(1, done, always);

    overlay.put(
      1,
      (view) => ({ ...v.parse(Row, view.data), status: 'weird' }),
      always,
    );
    base.set(readyAt(1, { note: 'Заметка' }));

    expect(overlay.get().expected).toBe(true);
    expect(overlay.get().view?.data).toEqual({ ...DATA, status: 'done' });
    expect(faults.map((f) => f.node)).toEqual([CARD_ID]);
    expect(faults[0]?.error).toEqual(new Error(PAGE_FAULTS.expected));
    expect(JSON.stringify(faults)).not.toContain('weird');
  });

  test('единственное наложение отказано проверкой — значение источника, expecting ложно', () => {
    const { base, overlay, faults } = overlaid();

    overlay.put(
      1,
      (view) => ({ ...v.parse(Row, view.data), status: 'weird' }),
      always,
    );

    expect(overlay.get()).toBe(base.get());
    expect(overlay.expecting()).toBe(false);
    expect(faults).toHaveLength(1);
  });

  test('функция бросила — так же: наложения нет, сбой фиксированным текстом без исходного броска', () => {
    const { overlay, faults } = overlaid();
    const boom = new Error('итог упал: Хлеб');
    overlay.put(1, done, always);

    overlay.put(
      1,
      () => {
        throw boom;
      },
      always,
    );

    expect(overlay.get().expected).toBe(true);
    expect(overlay.get().view?.data).toEqual({ ...DATA, status: 'done' });
    expect(faults).toHaveLength(1);
    expect(faults[0]?.node).toBe(CARD_ID);
    expect(faults[0]?.error).not.toBe(boom);
    expect(faults[0]?.error).toEqual(new Error(PAGE_FAULTS.expected));
    expect(faults[0]?.error).not.toHaveProperty('cause');
    expect(String(faults[0]?.error)).not.toContain('Хлеб');
  });

  test('проверка получает вид области: экран — тот, что в виде', () => {
    const screens: string[] = [];
    const { overlay } = overlaid(readyAt(1), (view, data) => {
      screens.push(view.screen);
      return byRow(view, data);
    });

    overlay.put(1, done, always);

    expect(screens).toContain(CARD_ID);
  });
});

describe('PageOverlay — бросок слушателя', () => {
  test('бросок слушателя — сбой с узлом экрана адреса; прочие слушатели значение получили', () => {
    const { overlay, faults, log } = overlaid();
    const boom = new Error('слушатель упал');
    let armed = false;
    overlay.subscribe(() => {
      if (armed) throw boom;
    });
    const after: PageViewState[] = [];
    overlay.subscribe((state) => {
      after.push(state);
    });
    armed = true;

    overlay.put(1, done, always);

    expect(faults).toEqual([{ node: CARD_ID, error: boom }]);
    expect(log.at(-1)?.expected).toBe(true);
    expect(after.at(-1)?.expected).toBe(true);
  });

  test('бросок слушателя пустой области — узел — имя канала', () => {
    const { base, overlay, faults } = overlaid({
      status: 'empty',
      refreshing: false,
      issues: [],
    });
    const boom = new Error('слушатель упал');
    let armed = false;
    overlay.subscribe(() => {
      if (armed) throw boom;
    });
    armed = true;

    base.set({
      status: 'empty',
      refreshing: false,
      note: 'Заметка',
      issues: [],
    });

    expect(faults).toEqual([{ node: PAGE_CHANNEL, error: boom }]);
  });
});

describe('PageOverlay — значения — данные JSON', () => {
  test('каждое значение: JSON-копия равна, значение не меняется после выдачи', () => {
    const { base, overlay } = overlaid();
    const seen: { state: PageViewState; json: string }[] = [];
    overlay.subscribe((state) => {
      seen.push({ state, json: JSON.stringify(state) });
    });

    const first = overlay.put(1, done, always);
    overlay.put(1, renamed, always);
    base.set(readyAt(1, { refreshing: true }));
    first();
    base.set(readyAt(2));

    expect(seen.some((s) => s.state.expected === true)).toBe(true);
    for (const { state, json } of seen) {
      expect(JSON.parse(json)).toEqual(state);
      expect(JSON.stringify(state)).toBe(json);
    }
  });
});
