import { describe, expect, test } from 'bun:test';
import { testUuid, useTempDir } from 'dmg-core/testing';
import {
  ASSIGNED_ID,
  CARD_ID,
  FollowAssignedStoryDef,
  LIST_ID,
  MainMenuScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import type { PageViewState } from 'dmg-ui/web-ui';
import {
  exampleWorld,
  openTab,
  personOf,
  settle,
  TOKEN_ANNA,
  TOKEN_BORIS,
} from '../testing/example-world';
import { RegionFrame } from './region-frame';
import type { RegionModel } from './region-model.types';
import { HELP_TEXTS } from './view-texts.const';

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
      return [
        ...body.rows.flatMap((row) => [row.openable, row.selectable]),
        ...body.actions.map((action) => action.enabled),
      ];
    case 'user':
    case 'menu':
      return [];
  }
};

/** Anna с задачами `titles` (по умолчанию три) и открытой карточкой «Хлеб»; кадры списка и карточки. */
const world = async (titles = ['Хлеб', 'Молоко', 'Сыр']) => {
  const w = exampleWorld(tmp().path);
  const a = await openTab(w, TOKEN_ANNA, 'a');
  await a.client.route('/');
  for (const title of titles) {
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
    // Две открытые: при трёх «Создать задачу» отключено пределом открытых.
    const { a, frame } = await world(['Хлеб', 'Молоко']);
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

/** Анна с открытой «Хлеб», назначенной себе; «Назначенные мне» в окне, строка отмечена — действие доступно. */
const assignedWorld = async () => {
  const { w, a, frame } = await world(['Хлеб']);
  await a.client.submit('side', 'assign', {
    assigneeId: personOf('anna').uuid,
  });
  await settle(w, a);
  await a.client.openLink({ screen: ASSIGNED_ID, params: {} });
  await a.client.local('modal', 'toggle', { taskId: 'Хлеб' });
  await settle(w, a);
  return { w, a, frame };
};

describe('RegionFrame — «Назначенные мне»: действия под приглушением', () => {
  /** Действие `completeSelected` тела «Назначенные мне»; нет — бросок. */
  const completeSelected = (model: RegionModel) => {
    if (model.body?.kind !== 'assigned') throw new Error('нужно тело assigned');
    const found = model.body.actions.find((x) => x.name === 'completeSelected');
    if (found === undefined) throw new Error('нет completeSelected');
    return found;
  };

  const states = [
    ['нет связи', { stale: 'offline' }],
    ['ожидаемый итог', { expected: true }],
  ] as const;

  test('в готовом виде действие выбранного доступно: управление не пустое', async () => {
    const { a, frame } = await assignedWorld();

    const model = frame.next(a.client.region('modal'));

    expect(model.body?.kind).toBe('assigned');
    expect(completeSelected(model).enabled).toBe(true);
  });

  for (const [name, mark] of states) {
    test(`${name}: строки и все действия «Назначенные мне» выключены, включая «Выполнить выбранные»`, async () => {
      const { a, frame } = await assignedWorld();

      const model = frame.next({ ...a.client.region('modal'), ...mark });

      expect(model.busy).toBe(true);
      expect(completeSelected(model).enabled).toBe(false);
      expect(controls(model).every((enabled) => !enabled)).toBe(true);
    });
  }

  test('загрузка другого экрана: прежние «Назначенные мне» без управления, действия тоже', async () => {
    const { a, frame } = await assignedWorld();
    frame.next(a.client.region('modal'));

    const model = frame.next({
      status: 'loading',
      address: { screen: CARD_ID, params: { taskId: testUuid(5) } },
      refreshing: false,
      issues: [],
    });

    expect(model.body?.kind).toBe('assigned');
    expect(completeSelected(model).enabled).toBe(false);
    expect(controls(model).every((enabled) => !enabled)).toBe(true);
  });
});

describe('RegionFrame — приглушённая область хранит причины вида', () => {
  const listBody = (model: RegionModel) => {
    if (model.body?.kind !== 'list') throw new Error('ожидалось тело list');
    return model.body;
  };

  test('нет связи: серые «Дальше» и «Назад» сохраняют reason, «Закрыть» причины не получает', async () => {
    const { a, frame } = await world(['Хлеб', 'Молоко']);

    const model = frame.next({ ...a.client.region('main'), stale: 'offline' });
    const { actions } = listBody(model);
    const named = (name: string) => actions.find((x) => x.name === name);

    expect(named('next')).toMatchObject({
      enabled: false,
      reason: 'Дальше задач нет',
    });
    expect(named('prev')).toMatchObject({
      enabled: false,
      reason: 'Это первая страница',
    });
    expect(named('close')?.enabled).toBe(false);
    expect(named('close')).not.toHaveProperty('reason');
  });

  test('ожидаемый итог: форма, отключённая видом, сохраняет reason', async () => {
    const { a, frame } = await world();
    const state = a.client.region('main');

    const model = frame.next({ ...state, expected: true });
    const create = listBody(model).forms.find((x) => x.name === 'create');

    expect(create).toMatchObject({
      enabled: false,
      reason: 'Слишком много открытых задач',
    });
  });

  test('загрузка: прежнее тело держит reason отключённых', async () => {
    const { a, frame } = await world();
    frame.next(a.client.region('main'));

    const model = frame.next({
      status: 'loading',
      address: { screen: CARD_ID, params: { taskId: testUuid(5) } },
      refreshing: false,
      issues: [],
    });
    const create = listBody(model).forms.find((x) => x.name === 'create');

    expect(create).toMatchObject({
      enabled: false,
      reason: 'Слишком много открытых задач',
    });
  });

  test('приглушённое доступное — enabled false, причины нет', async () => {
    const { a, frame } = await world(['Хлеб', 'Молоко']);

    const model = frame.next({ ...a.client.region('main'), stale: 'offline' });
    const create = listBody(model).forms.find((x) => x.name === 'create');

    expect(create?.enabled).toBe(false);
    expect(create).not.toHaveProperty('reason');
  });
});

describe('RegionFrame — справка области', () => {
  const missing = { screen: CARD_ID, params: { taskId: testUuid(9) } };
  const toCard = (id: string): PageViewState => ({
    status: 'loading',
    address: { screen: CARD_ID, params: { taskId: id } },
    refreshing: false,
    issues: [],
  });
  /** Строки раздела `heading` справки; раздела нет — пусто. */
  const linesOf = (model: RegionModel, heading: string): readonly string[] =>
    model.help?.sections.find((section) => section.heading === heading)
      ?.lines ?? [];

  test('готовый вид: справка закрыта, заголовок — подпись экрана, подсказка — из Def, разделы не пусты', async () => {
    const { a, frame } = await world();

    const model = frame.next(a.client.region('main'));

    expect(model.help).toMatchObject({
      open: false,
      title: TaskListScreenDef.label,
      hint: TaskListScreenDef.hint!,
    });
    expect(model.help?.sections.length).toBeGreaterThan(0);
  });

  test('справка называет отключённое с причиной из вида; подписи — из Def', async () => {
    const { a, frame } = await world();
    const { actions } = TaskListScreenDef;

    const model = frame.next(a.client.region('main'));

    const lines = linesOf(model, HELP_TEXTS.items);
    expect(lines).toContain(
      `${actions.completeSelected.label} (${HELP_TEXTS.unavailable}: Отметьте открытые задачи)`,
    );
    expect(lines).toContain(
      `${actions.prev.label} (${HELP_TEXTS.unavailable}: Это первая страница)`,
    );
    expect(lines).toContain(`${actions.jumpTo.label} — ${actions.jumpTo.hint}`);
  });

  test('справка меню: двери по подписям Def, подсказка «Назначенные мне» — из сторис; у «Мои задачи» (две сторис) подсказки нет', async () => {
    const { a, frame } = await world();
    await a.client.route('/menu');
    const { actions } = MainMenuScreenDef;

    const model = frame.next(a.client.region('main'));

    expect(model.help?.title).toBe(MainMenuScreenDef.label);
    const leads = linesOf(model, HELP_TEXTS.leads);
    expect(leads).toContain(
      `${actions.assigned.label} — ${FollowAssignedStoryDef.hint}`,
    );
    expect(leads).toContain(actions.tasks.label);
    expect(linesOf(model, HELP_TEXTS.items)).toEqual([actions.close.label]);
  });

  test('справки нет у пустой области и у отказа', async () => {
    const { a, frame } = await world();
    await a.client.openLink(missing);

    expect(frame.next(empty).help).toBeUndefined();
    expect(frame.next(a.client.region('side')).status).toBe('refused');
    expect(frame.next(a.client.region('side')).help).toBeUndefined();
  });

  test('первая загрузка — справки нет; загрузка с удерживаемым телом — прежняя справка той же области', async () => {
    const { a, frame } = await world();
    expect(frame.next(toCard(testUuid(5))).help).toBeUndefined();
    const before = frame.next(a.client.region('main'));

    const model = frame.next(toCard(testUuid(5)));

    expect(model.status).toBe('loading');
    expect(model.help?.title).toBe(before.help?.title);
    expect(model.help?.sections).toEqual(before.help?.sections ?? []);
  });

  test('toggleHelp открывает справку и закрывает её повторно', async () => {
    const { a, frame } = await world();
    const state = a.client.region('main');
    frame.next(state);

    frame.toggleHelp();
    expect(frame.next(state).help?.open).toBe(true);

    frame.toggleHelp();
    expect(frame.next(state).help?.open).toBe(false);
  });

  test('открытая справка остаётся открытой, а разделы прежними при перерисовке того же экрана: перечитывание, новая ревизия, нет связи, ожидаемый итог', async () => {
    const { a, frame } = await world();
    const ready = frame.next(a.client.region('main'));
    frame.toggleHelp();

    const refreshed = frame.next({
      ...a.client.region('main'),
      refreshing: true,
    });
    await a.client.local('main', 'toggle', { taskId: 'Хлеб' });
    const changed = frame.next(a.client.region('main'));
    const offline = frame.next({
      ...a.client.region('main'),
      stale: 'offline',
    });
    const expecting = frame.next({
      ...a.client.region('main'),
      expected: true,
    });

    for (const model of [refreshed, changed, offline, expecting]) {
      expect(model.help?.open).toBe(true);
    }
    expect(refreshed.help?.sections).toEqual(ready.help?.sections ?? []);
    expect(offline.help?.sections).toEqual(changed.help?.sections ?? []);
    expect(expecting.help?.sections).toEqual(changed.help?.sections ?? []);
    expect(offline.busy).toBe(true);
    expect(expecting.busy).toBe(true);
  });

  test('открытая справка закрывается при смене экрана области; новый экран открывается закрытым', async () => {
    const { a, frame } = await world();
    frame.next(a.client.region('main'));
    frame.toggleHelp();
    expect(frame.next(a.client.region('main')).help?.open).toBe(true);

    const next = frame.next(a.client.region('side'));

    expect(next.screen).toBe(CARD_ID);
    expect(next.help?.open).toBe(false);
    expect(frame.next(a.client.region('main')).help?.open).toBe(false);
  });

  test('toggleHelp до первого состояния — ничего не ломает', async () => {
    const { a } = await world();
    const frame = new RegionFrame();

    frame.toggleHelp();

    expect(frame.next(a.client.region('main')).help?.open).toBe(false);
  });

  test('у каждой области свой кадр: открытая справка одной не открывает справку другой', async () => {
    const { a } = await world();
    const main = new RegionFrame();
    const side = new RegionFrame();
    main.next(a.client.region('main'));
    side.next(a.client.region('side'));

    main.toggleHelp();

    expect(main.next(a.client.region('main')).help?.open).toBe(true);
    expect(side.next(a.client.region('side')).help?.open).toBe(false);
  });
});

describe('RegionFrame — начальный фокус экрана', () => {
  const TITLE_FOCUS = 'field:create:title';

  test('первый готовый кадр списка с доступной основной формой — фокус на её первом поле', async () => {
    const { a, frame } = await world(['Хлеб']);

    expect(frame.next(a.client.region('main')).focus).toBe(TITLE_FOCUS);
  });

  test('тот же экран повторно — ключа focus нет', async () => {
    const { a, frame } = await world(['Хлеб']);
    frame.next(a.client.region('main'));

    expect(frame.next(a.client.region('main'))).not.toHaveProperty('focus');
  });

  test('основная форма отключена (предел открытых задач) — ключа focus нет', async () => {
    const { a, frame } = await world();

    expect(frame.next(a.client.region('main'))).not.toHaveProperty('focus');
  });

  test('экран без основной формы (карточка) — ключа focus нет', async () => {
    const { a, frame } = await world(['Хлеб']);

    expect(frame.next(a.client.region('side'))).not.toHaveProperty('focus');
  });

  test('приглушённый кадр не решает: фокус — на первом неприглушённом', async () => {
    const { a, frame } = await world(['Хлеб']);
    const state = a.client.region('main');

    const offline = frame.next({ ...state, stale: 'offline' });

    expect(offline).not.toHaveProperty('focus');
    expect(frame.next(state).focus).toBe(TITLE_FOCUS);
  });

  test('после пустой области тот же экран снова получает фокус', async () => {
    const { a, frame } = await world(['Хлеб']);
    frame.next(a.client.region('main'));
    frame.next(empty);

    expect(frame.next(a.client.region('main')).focus).toBe(TITLE_FOCUS);
  });
});
