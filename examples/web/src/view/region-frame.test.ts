import { describe, expect, test } from 'bun:test';
import { testUuid, useTempDir } from 'dmg-core/testing';
import { ASSIGNED_ID, CARD_ID, LIST_ID } from 'dmg-ui/testing';
import type { PageViewState } from 'dmg-ui/web-ui';
import {
  exampleWorld,
  openTab,
  settle,
  TOKEN_ANNA,
  TOKEN_BORIS,
} from '../testing/example-world';
import { RegionFrame } from './region-frame';
import type { RegionModel } from './region-model.types';

// Модель области — то, что видит человек: пометки, приглушение, строки,
// формы, «держать прежний показ при переходе». Чистая функция состояния
// области (`RegionFrame.next`), без DOM. Состояния — настоящего клиента над
// сервером в памяти; варианты (перечитывание, обрыв, ожидаемый итог) —
// копии состояния с нужным полем, как их выдаёт клиент.

const tmp = useTempDir('example-web-region-');

const OFFLINE = 'Нет связи — переподключаемся';
const EXPECTING = 'Ждём ответа…';
const REFRESHING = 'Обновляется…';
const LOADING = 'Загрузка…';

/** Все признаки «управление включено» тела: строки, перетаскивание, зона, действия, формы. */
const controls = (model: RegionModel): boolean[] => {
  const body = model.body;
  if (body === undefined) return [];
  switch (body.kind) {
    case 'list':
      return [
        ...body.rows.flatMap((row) => [row.openable, row.selectable]),
        ...body.actions.map((action) => action.enabled),
        ...body.forms.map((form) => form.enabled),
      ];
    case 'card':
      return [
        body.draggable,
        body.dropEnabled,
        ...body.actions.map((action) => action.enabled),
        ...body.forms.map((form) => form.enabled),
      ];
    case 'assigned':
      return body.rows.flatMap((row) => [row.openable, row.selectable]);
  }
};

/** Anna с тремя задачами и открытой карточкой «Хлеб»; кадры списка и карточки. */
const world = async () => {
  const w = exampleWorld(tmp().path);
  const a = await openTab(w, TOKEN_ANNA, 'a');
  await a.client.route('/');
  for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
    await a.client.submit('main', 'create', { title });
  }
  await a.client.submit('main', 'open', { taskId: 'Хлеб' });
  await settle(w, a);
  return { w, a, frame: new RegionFrame() };
};

const empty: PageViewState = { status: 'empty', refreshing: false, issues: [] };

describe('RegionFrame — пустая область и первая загрузка', () => {
  test('пустая область: пометок нет, тела нет, не приглушена', () => {
    const model = new RegionFrame().next(empty);

    expect(model).toMatchObject({ status: 'empty', marks: [], busy: false });
    expect(model.body).toBeUndefined();
    expect(model.retry).toBe(false);
  });

  test('пустая область с заметкой — только заметка', () => {
    const model = new RegionFrame().next({
      ...empty,
      note: 'Страница не найдена',
    });

    expect(model.note).toBe('Страница не найдена');
    expect(model.body).toBeUndefined();
    expect(model.marks).toEqual([]);
  });

  test('первая загрузка: одна пометка «Загрузка…», тела нет, экран — по адресу цели', () => {
    const model = new RegionFrame().next({
      status: 'loading',
      address: { screen: LIST_ID, params: { page: 0 } },
      refreshing: false,
      issues: [],
    });

    expect(model).toMatchObject({
      status: 'loading',
      screen: LIST_ID,
      marks: [LOADING],
    });
    expect(model.body).toBeUndefined();
  });
});

describe('RegionFrame — готовый вид', () => {
  test('список: тело, ревизия, подпись экрана; пометок нет, не приглушена', async () => {
    const { a, frame } = await world();
    const state = a.client.region('main');

    const model = frame.next(state);

    expect(model).toMatchObject({
      status: 'ready',
      screen: LIST_ID,
      title: 'Мои задачи',
      marks: [],
      busy: false,
      revision: state.view?.revision,
    });
    expect(model.body?.kind).toBe('list');
    expect(controls(model).some(Boolean)).toBe(true);
  });

  test('карточка в соседней области: тело карточки', async () => {
    const { a, frame } = await world();

    const model = frame.next(a.client.region('side'));

    expect(model).toMatchObject({ status: 'ready', screen: CARD_ID });
    expect(model.body?.kind).toBe('card');
  });

  test('«Назначенные мне» — тело assigned', async () => {
    const { w, a, frame } = await world();
    const b = await openTab(w, TOKEN_BORIS, 'b');
    await b.client.route('/assigned');
    await settle(w, a, b);

    const model = frame.next(b.client.region('main'));

    expect(model).toMatchObject({
      screen: ASSIGNED_ID,
      title: 'Назначенные мне',
    });
    expect(model.body?.kind).toBe('assigned');
  });

  test('модель — данные JSON: круг через JSON ничего не меняет', async () => {
    const { a, frame } = await world();

    for (const region of ['main', 'side'] as const) {
      const model = frame.next(a.client.region(region));

      expect(JSON.parse(JSON.stringify(model))).toEqual(model);
    }
  });

  test('следующая модель не меняет прежнюю', async () => {
    const { a, frame } = await world();
    const first = frame.next(a.client.region('main'));
    const snapshot = JSON.stringify(first);

    frame.next({ ...a.client.region('main'), stale: 'offline' });

    expect(JSON.stringify(first)).toBe(snapshot);
  });
});

describe('RegionFrame — пометки и приглушение', () => {
  test('перечитывание: «Обновляется…», вид прежний, управление включено', async () => {
    const { a, frame } = await world();
    const ready = frame.next(a.client.region('main'));

    const model = frame.next({ ...a.client.region('main'), refreshing: true });

    expect(model.marks).toEqual([REFRESHING]);
    expect(model.busy).toBe(false);
    expect(model.body).toEqual(ready.body);
  });

  test('нет связи: пометка, область приглушена, всё управление и перетаскивание отключены', async () => {
    const { a, frame } = await world();

    for (const region of ['main', 'side'] as const) {
      const model = frame.next({
        ...a.client.region(region),
        stale: 'offline',
      });

      expect(model.marks).toEqual([OFFLINE]);
      expect(model.busy).toBe(true);
      expect(controls(model).length).toBeGreaterThan(0);
      expect(controls(model).every((enabled) => !enabled)).toBe(true);
    }
  });

  test('устарел по ревизии — не обрыв: пометки нет', async () => {
    const { a, frame } = await world();

    const model = frame.next({ ...a.client.region('main'), stale: 'revision' });

    expect(model.marks).not.toContain(OFFLINE);
  });

  test('ожидаемый итог: «Ждём ответа…», приглушена, данные — итог, управление отключено', async () => {
    const { a, frame } = await world();
    const state = a.client.region('side');
    const view = state.view;
    if (view === undefined) throw new Error('нет вида карточки');
    const done = { ...(view.data as object), status: 'done' };

    const model = frame.next({
      ...state,
      expected: true,
      view: { ...view, data: done },
    });

    expect(model.marks).toEqual([EXPECTING]);
    expect(model.busy).toBe(true);
    expect(model.body).toMatchObject({ kind: 'card', done: true });
    expect(controls(model).every((enabled) => !enabled)).toBe(true);
  });
});

describe('RegionFrame — отказ', () => {
  const missing = { screen: CARD_ID, params: { taskId: testUuid(9) } };

  test('экран не открылся: текст отказа и «Повторить», тела нет', async () => {
    const { a, frame } = await world();
    await a.client.openLink(missing);
    const state = a.client.region('side');

    const model = frame.next(state);

    expect(state.view?.status).toBe('refused');
    expect(model.status).toBe('refused');
    expect(model.retry).toBe(true);
    expect(model.refusal).toBe(state.view?.refusal?.text);
    expect(model.refusal).toBeTruthy();
    expect(model.body).toBeUndefined();
  });

  test('«Повторить» есть только у отказа', async () => {
    const { a, frame } = await world();

    expect(frame.next(a.client.region('main')).retry).toBe(false);
    expect(frame.next(empty).retry).toBe(false);
  });
});

describe('RegionFrame — переход: держать прежний показ', () => {
  const toCard = (id: string): PageViewState => ({
    status: 'loading',
    address: { screen: CARD_ID, params: { taskId: id } },
    refreshing: false,
    issues: [],
  });

  test('готовый вид → загрузка другого экрана: прежнее тело сохранено, приглушено, пометка «Загрузка…», экран — по адресу цели', async () => {
    const { a, frame } = await world();
    const before = frame.next(a.client.region('main'));

    const model = frame.next(toCard(testUuid(5)));

    expect(model.status).toBe('loading');
    expect(model.screen).toBe(CARD_ID);
    expect(model.marks).toEqual([LOADING]);
    expect(model.busy).toBe(true);
    expect(model.body?.kind).toBe('list');
    if (model.body?.kind === 'list' && before.body?.kind === 'list') {
      expect(model.body.rows.map((row) => row.uuid)).toEqual(
        before.body.rows.map((row) => row.uuid),
      );
    }
  });

  test('прежнее тело в загрузке — без управления: жест не уйдёт по виду экрана, которого уже нет', async () => {
    const { a, frame } = await world();
    frame.next(a.client.region('main'));

    const model = frame.next(toCard(testUuid(5)));

    expect(controls(model).length).toBeGreaterThan(0);
    expect(controls(model).every((enabled) => !enabled)).toBe(true);
  });

  test('загрузка после пустой области — прежнего тела нет', async () => {
    const { a, frame } = await world();
    frame.next(a.client.region('main'));
    frame.next(empty);

    const model = frame.next(toCard(testUuid(5)));

    expect(model.marks).toEqual([LOADING]);
    expect(model.body).toBeUndefined();
  });

  test('пустая область сбрасывает прежний показ', async () => {
    const { a, frame } = await world();
    frame.next(a.client.region('side'));

    expect(frame.next(empty).body).toBeUndefined();
  });

  test('новый готовый вид заменяет прежнее тело и снимает пометку', async () => {
    const { a, frame } = await world();
    frame.next(a.client.region('main'));
    frame.next(toCard(testUuid(5)));

    const model = frame.next(a.client.region('side'));

    expect(model.marks).toEqual([]);
    expect(model.busy).toBe(false);
    expect(model.body?.kind).toBe('card');
  });

  test('у каждой области свой кадр: загрузка в одной не держит показ другой', async () => {
    const { a } = await world();
    const main = new RegionFrame();
    const side = new RegionFrame();
    main.next(a.client.region('main'));

    const model = side.next(toCard(testUuid(5)));

    expect(model.body).toBeUndefined();
  });
});

describe('RegionFrame — что переносится из состояния', () => {
  test('подтверждение: действие, подпись и описание', async () => {
    const { a, frame } = await world();
    await a.client.local('main', 'toggle', { taskId: 'Хлеб' });
    await a.client.submit('main', 'completeSelected', {});
    const state = a.client.region('main');

    const model = frame.next(state);

    expect(state.confirm).toBeDefined();
    expect(model.confirm).toEqual(state.confirm);
  });

  test('заметка области переносится', async () => {
    const { a, frame } = await world();

    expect(
      frame.next({ ...a.client.region('main'), note: 'Задача создана' }).note,
    ).toBe('Задача создана');
  });

  test('отказ формы по полю: замечание у поля формы, общих замечаний нет, введённое в поле на месте', async () => {
    const { a, frame } = await world();
    await a.client.submit('main', 'create', { title: '' });

    const model = frame.next(a.client.region('main'));

    const create =
      model.body?.kind === 'list'
        ? model.body.forms.find((form) => form.name === 'create')
        : undefined;
    expect(create?.fields[0]).toMatchObject({
      name: 'title',
      value: '',
      issues: ['Название не может быть пустым'],
    });
    expect(model.issues).toEqual([]);
  });

  test('замечание без формы — общие замечания модели', async () => {
    const { a, frame } = await world();

    const model = frame.next({
      ...a.client.region('main'),
      issues: [{ text: 'Что-то не так' }],
    });

    expect(model.issues).toEqual(['Что-то не так']);
  });
});
