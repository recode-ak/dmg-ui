import { describe, expect, test } from 'bun:test';
import { TaskPolicy } from 'dmg-core/testing/example';
import {
  ASSIGNED_ID,
  ExampleUiSetDef,
  FollowAssignedStoryDef,
  LIST_ID,
  MainMenuScreenDef,
  StartWorkStoryDef,
  TaskListScreenDef,
} from 'dmg-ui/example';
import * as v from 'valibot';
import { ExampleMenuStubUiAppDef } from '../../testing/ui-app.fixture';
import { UiScene } from '../../testing/ui-arch';
import { UiIds } from '../address/ui-ids';
import type { ActionView, InstanceView, LocalView } from './outcome.types';
import { ScreenHelp } from './screen-help';

// Содержание справки по виду экземпляра: данные, не текст. Вид — литерал
// (справка работает только по нему, субъекта и Policy не знает); приложение
// решает, какие действия — двери. Скрытого в виде нет, поэтому в справке его
// нет по построению; на настоящем исполнителе это проверяет приёмка.

const MENU_ID = new UiIds(ExampleUiSetDef).screen(MainMenuScreenDef);
const READ_ONLY_TEXT = 'Только чтение: изменения недоступны';

const available = { kind: 'available' } as const;
const off = (text: string) => ({ kind: 'disabled', text }) as const;

const act = (name: string, over: Partial<ActionView> = {}): ActionView => ({
  name,
  availability: available,
  fields: [],
  ...over,
});
const local = (name: string, over: Partial<LocalView> = {}): LocalView => ({
  name,
  availability: available,
  fields: [],
  ...over,
});

const viewOf = (
  screen: string,
  over: Partial<InstanceView> = {},
): InstanceView => ({
  screen,
  address: { screen, params: {} },
  revision: 1,
  status: 'ready',
  context: {
    locale: 'ru-RU',
    timeZone: 'Asia/Oral',
    delegate: false,
    readOnly: false,
  },
  actions: [],
  locals: [],
  ...over,
});

const help = new ScreenHelp(ExampleMenuStubUiAppDef);
const menu = (
  actions: readonly ActionView[],
  over: Partial<InstanceView> = {},
) => viewOf(MENU_ID, { actions, ...over });

describe('ScreenHelp.of: заголовок и подсказка', () => {
  test('заголовок — подпись экрана из Def', () => {
    expect(help.of(menu([])).title).toBe(MainMenuScreenDef.label);
    expect(help.of(viewOf(LIST_ID)).title).toBe(TaskListScreenDef.label);
  });

  test('подсказка — из вида', () => {
    const sheet = help.of(menu([], { hint: 'Подсказка из вида' }));

    expect(sheet.hint).toBe('Подсказка из вида');
  });

  test('в виде нет подсказки — в листе нет ключа hint', () => {
    expect(help.of(menu([]))).not.toHaveProperty('hint');
  });

  test('экран без действий — оба списка пусты', () => {
    const sheet = help.of(menu([]));

    expect(sheet.items).toEqual([]);
    expect(sheet.leads).toEqual([]);
  });
});

describe('ScreenHelp.of: items — действия, затем локальные', () => {
  const tasks = viewOf(LIST_ID, {
    actions: [
      act('open', { hint: 'Подсказка из вида' }),
      act('create', { availability: off('Слишком много открытых задач') }),
      act('next', { availability: off('Дальше задач нет') }),
      act('close'),
    ],
    locals: [local('toggle')],
  });
  const { actions } = TaskListScreenDef;

  test('порядок вида: действия по порядку, затем локальные', () => {
    const sheet = help.of(tasks);

    expect(sheet.items.map((item) => item.name)).toEqual([
      'open',
      'create',
      'next',
      'close',
      'toggle',
    ]);
  });

  test('подпись — из Def действия и локального действия', () => {
    const labels = help.of(tasks).items.map((item) => item.label);

    expect(labels.slice(0, 4)).toEqual([
      actions.open.label,
      actions.create.label,
      actions.next.label,
      actions.close.label,
    ]);
    expect(labels[4]).toBe(TaskListScreenDef.locals.toggle.label);
  });

  test('доступное — без ключа disabled, подсказка — из вида', () => {
    const [open, , , close, toggle] = help.of(tasks).items;

    expect(open).toStrictEqual({
      name: 'open',
      label: actions.open.label,
      hint: 'Подсказка из вида',
    });
    expect(close).toStrictEqual({ name: 'close', label: actions.close.label });
    expect(toggle).not.toHaveProperty('disabled');
  });

  test('отключённое — disabled равен тексту причины из вида', () => {
    const items = help.of(tasks).items;

    expect(items.find((item) => item.name === 'create')?.disabled).toBe(
      'Слишком много открытых задач',
    );
    expect(items.find((item) => item.name === 'next')?.disabled).toBe(
      'Дальше задач нет',
    );
  });

  test('отключённое локальное действие — тоже с причиной', () => {
    const sheet = help.of(
      viewOf(LIST_ID, {
        locals: [local('toggle', { availability: off('Задач нет') })],
      }),
    );

    expect(sheet.items).toStrictEqual([
      {
        name: 'toggle',
        label: TaskListScreenDef.locals.toggle.label,
        disabled: 'Задач нет',
      },
    ]);
  });

  test('заместитель: действия с UC в виде отключены текстом ядра — справка называет их с этим текстом', () => {
    const readOnly = viewOf(LIST_ID, {
      context: { ...tasks.context, readOnly: true, delegate: true },
      actions: [
        act('create', { availability: off(READ_ONLY_TEXT) }),
        act('completeSelected', { availability: off(READ_ONLY_TEXT) }),
        act('close'),
      ],
    });

    const { items } = help.of(readOnly);

    expect(items.map((item) => [item.name, item.disabled])).toEqual([
      ['create', READ_ONLY_TEXT],
      ['completeSelected', READ_ONLY_TEXT],
      ['close', undefined],
    ]);
  });
});

describe('ScreenHelp.of: двери — в leads', () => {
  const doors = [
    act('tasks'),
    act('assigned', { hint: FollowAssignedStoryDef.hint! }),
    act('close'),
  ];
  const { actions } = MainMenuScreenDef;

  test('доступная дверь — в leads с подписью из Def и подсказкой из вида, не в items', () => {
    const sheet = help.of(menu(doors));

    expect(sheet.leads).toStrictEqual([
      { name: 'tasks', label: actions.tasks.label },
      {
        name: 'assigned',
        label: actions.assigned.label,
        hint: FollowAssignedStoryDef.hint!,
      },
    ]);
    expect(sheet.items).toStrictEqual([
      { name: 'close', label: actions.close.label },
    ]);
  });

  test('отключённая дверь — в items с причиной, в leads её нет', () => {
    const sheet = help.of(
      menu([
        act('tasks'),
        act('assigned', {
          hint: FollowAssignedStoryDef.hint!,
          availability: off('Поручений нет'),
        }),
        act('close'),
      ]),
    );

    expect(sheet.leads.map((item) => item.name)).toEqual(['tasks']);
    expect(sheet.items).toStrictEqual([
      {
        name: 'assigned',
        label: actions.assigned.label,
        hint: FollowAssignedStoryDef.hint!,
        disabled: 'Поручений нет',
      },
      { name: 'close', label: actions.close.label },
    ]);
  });

  test('действие с UC и действие без перехода — не двери: они в items', () => {
    const sheet = help.of(
      viewOf(LIST_ID, { actions: [act('create'), act('close')] }),
    );

    expect(sheet.leads).toEqual([]);
    expect(sheet.items.map((item) => item.name)).toEqual(['create', 'close']);
  });
});

describe('ScreenHelp.of: текст — только hint', () => {
  const MARKERS = [
    'ОПИСАНИЕ_ЭКРАНА',
    'ОПИСАНИЕ_ДЕЙСТВИЯ',
    'ОПИСАНИЕ_ЛОКАЛЬНОГО',
    'ОПИСАНИЕ_СТОРИС',
    'ЦЕЛЬ_СТОРИС',
  ];
  const target = UiScene.screen('target');
  const hub = UiScene.screen('hub', {
    description: 'ОПИСАНИЕ_ЭКРАНА',
    state: v.strictObject({}),
    locals: {
      pick: { label: 'Отметить', description: 'ОПИСАНИЕ_ЛОКАЛЬНОГО' },
    },
    actions: {
      go: {
        label: 'Идти',
        description: 'ОПИСАНИЕ_ДЕЙСТВИЯ',
        to: () => [target],
      },
      stay: { label: 'Остаться', description: 'ОПИСАНИЕ_ДЕЙСТВИЯ' },
    },
  });
  const next = UiScene.story('next', [target], {
    description: 'ОПИСАНИЕ_СТОРИС',
    goal: 'ЦЕЛЬ_СТОРИС',
  });
  const root = UiScene.story('root', [hub], {
    description: 'ОПИСАНИЕ_СТОРИС',
    goal: 'ЦЕЛЬ_СТОРИС',
    leads: () => [next],
  });
  const scene = new UiScene({
    screens: [hub, target],
    stories: [root, next],
  });
  const marked = new ScreenHelp(scene.app);

  test('описания и цели Def не попадают ни в одно поле листа экрана', () => {
    const sheet = marked.of(
      viewOf('miniUi/todo/hub', {
        hint: 'Подсказка экрана',
        actions: [act('go', { hint: 'Подсказка двери' }), act('stay')],
        locals: [local('pick')],
      }),
    );

    const text = JSON.stringify(sheet);
    for (const marker of MARKERS) expect(text).not.toContain(marker);
    expect(sheet.leads.map((item) => item.name)).toEqual(['go']);
    expect(sheet.items.map((item) => item.name)).toEqual(['stay', 'pick']);
  });

  test('и в общем листе приложения', () => {
    const text = JSON.stringify(marked.general());

    for (const marker of MARKERS) expect(text).not.toContain(marker);
  });
});

describe('ScreenHelp.general: корни приложения без access', () => {
  const fresh = (
    name: string,
    over: Parameters<typeof UiScene.story>[2] = {},
  ) => UiScene.story(name, [UiScene.screen(`${name}Screen`)], over);

  const sceneOf = (stories: ReturnType<typeof fresh>[]) =>
    new UiScene({
      screens: stories.flatMap((story) => [...story.screens]),
      stories,
    });

  test('учебное приложение: корень startWork — в leads с подписью и подсказкой, items пуст', () => {
    expect(help.general()).toStrictEqual({
      title: ExampleMenuStubUiAppDef.label,
      items: [],
      leads: [
        {
          name: 'startWork',
          label: StartWorkStoryDef.label,
          hint: StartWorkStoryDef.hint!,
        },
      ],
    });
  });

  test('заголовок — подпись приложения', () => {
    expect(help.general().title).toBe(ExampleMenuStubUiAppDef.label);
    expect(new ScreenHelp(sceneOf([fresh('solo')]).app).general().title).toBe(
      'Минимальное приложение',
    );
  });

  test('корни по порядку приложения; без hint — ключа нет', () => {
    const first = fresh('first', { hint: 'Первая' });
    const second = fresh('second');
    const third = fresh('third', { hint: 'Третья' });

    const sheet = new ScreenHelp(sceneOf([first, second, third]).app).general();

    expect(sheet.leads).toStrictEqual([
      { name: 'first', label: first.label, hint: 'Первая' },
      { name: 'second', label: second.label },
      { name: 'third', label: third.label, hint: 'Третья' },
    ]);
  });

  test('корень с access не назван, корень без него — назван', () => {
    const closed = fresh('closed', {
      hint: 'Закрытая',
      access: TaskPolicy.rules.canManage,
    });
    const open = fresh('open', { hint: 'Открытая' });

    const sheet = new ScreenHelp(sceneOf([closed, open]).app).general();

    expect(sheet.leads.map((item) => item.name)).toEqual(['open']);
  });

  test('не корни — сторис, на которые ведёт связь: потомок в лист не попадает', () => {
    const child = fresh('child', { hint: 'Потомок' });
    const parent = fresh('parent', { leads: () => [child] });

    const sheet = new ScreenHelp(sceneOf([parent, child]).app).general();

    expect(sheet.leads.map((item) => item.name)).toEqual(['parent']);
  });

  test('все корни закрыты access — leads пуст', () => {
    const closed = fresh('closed', { access: TaskPolicy.rules.canManage });

    const sheet = new ScreenHelp(sceneOf([closed]).app).general();

    expect(sheet.leads).toEqual([]);
    expect(sheet.items).toEqual([]);
  });

  test('в приложении нет сторис — leads пуст', () => {
    const scene = new UiScene({
      screens: [UiScene.screen('alone')],
      stories: [],
    });

    expect(new ScreenHelp(scene.app).general().leads).toEqual([]);
  });
});

describe('ScreenHelp: лист ничего не меняет', () => {
  const deepFreeze = <T>(value: T): T => {
    if (typeof value === 'object' && value !== null) {
      for (const inner of Object.values(value)) deepFreeze(inner);
      Object.freeze(value);
    }
    return value;
  };

  test('вид после листа тот же; повторный вызов даёт равный лист', () => {
    const view = deepFreeze(
      viewOf(ASSIGNED_ID, {
        hint: 'Подсказка',
        actions: [act('completeSelected', { availability: off('Нельзя') })],
      }),
    );
    const before = structuredClone(view);

    const first = help.of(view);
    const second = help.of(view);

    expect(view).toEqual(before);
    expect(second).toEqual(first);
  });

  test('лист — данные JSON: круг через JSON ничего не меняет', () => {
    const sheet = help.of(
      menu([act('tasks'), act('close')], { hint: 'Подсказка' }),
    );

    expect(JSON.parse(JSON.stringify(sheet))).toEqual(sheet);
    expect(JSON.parse(JSON.stringify(help.general()))).toEqual(help.general());
  });
});

describe('ScreenHelp.of: вид не из набора приложения — бросок', () => {
  test('экрана вида нет в наборе — бросок с id экрана', () => {
    expect(() => help.of(viewOf('alienUi/alien/screen'))).toThrow(
      'alienUi/alien/screen',
    );
  });

  test('имени действия или локального действия из вида нет в Def — бросок с именем', () => {
    expect(() => help.of(menu([act('ghost')]))).toThrow('ghost');
    expect(() =>
      help.of(viewOf(LIST_ID, { locals: [local('phantom')] })),
    ).toThrow('phantom');
  });
});
