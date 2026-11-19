import { describe, expect, test } from 'bun:test';
import { useTempDir } from 'dmg-core/testing';
import { ScreenPreview } from 'dmg-ui';
import {
  ExampleUiSetDef,
  exampleCodes,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskListScreenDef,
  UserCardScreenDef,
} from 'dmg-ui/testing';
import { UiScene } from 'dmg-ui/testing/fixtures';
import { PageNotePresenter } from 'dmg-ui/web-ui';
import { examplePageViews } from 'dmg-ui/web-ui/testing';
import {
  exampleWorld,
  openTab,
  personOf,
  settle,
  TOKEN_ANNA,
  TOKEN_BORIS,
} from '../testing/example-world';
import {
  ExampleScreenView,
  ExampleViews,
  exampleWebViews,
} from './example-views';
import { RegionFrame } from './region-frame';
import type {
  ActionModel,
  FormModel,
  RegionModel,
  ScreenBody,
  TaskRowModel,
} from './region-model.types';

// Реестр представлений на DOM и то, что они решают о показе экранов примера:
// строки, выбор, формы, зона «Выполнено», перетаскивание. Модели — чистые
// данные; вид берётся у настоящего клиента над сервером в памяти.

const tmp = useTempDir('example-web-views-');

const ID = {
  list: 'exampleUi/todo/taskList',
  card: 'exampleUi/todo/taskCard',
  assigned: 'exampleUi/todo/assignedTasks',
  assignedNote: 'exampleUi/todo/taskAssigned',
  completedNote: 'exampleUi/todo/taskCompleted',
  user: 'exampleUi/users/userCard',
};

const BODY: ScreenBody = { kind: 'assigned', rows: [], actions: [] };

describe('ExampleViews.of — реестр', () => {
  test('готовый реестр примера: набор — набор учебного примера', () => {
    expect(exampleWebViews.set).toBe(ExampleUiSetDef);
  });

  test('presented() по составу равен текстовому реестру: пять экранов и два уведомления', () => {
    expect([...exampleWebViews.presented()].sort()).toEqual(
      [...examplePageViews.presented()].sort(),
    );
    expect(exampleWebViews.presented()).toHaveLength(7);
  });

  test('экран находится по id', () => {
    expect(exampleWebViews.screen(ID.list)).toBeDefined();
    expect(exampleWebViews.screen(ID.card)).toBeDefined();
    expect(exampleWebViews.screen(ID.assigned)).toBeDefined();
  });

  test('неизвестный экран — бросок с id', () => {
    expect(() => exampleWebViews.screen('нет/такого')).toThrow('нет/такого');
  });

  test('findNotification: известное — представление, неизвестное — undefined', () => {
    expect(exampleWebViews.findNotification(ID.assignedNote)).toBeDefined();
    expect(exampleWebViews.findNotification('нет/такого')).toBeUndefined();
  });

  test('notification неизвестного — бросок с id', () => {
    expect(() => exampleWebViews.notification('нет/такого')).toThrow(
      'нет/такого',
    );
  });

  test('Def вне набора — бросок', () => {
    const foreign = ExampleScreenView.for(
      UiScene.screen('foreign'),
      () => BODY,
    );

    expect(() => ExampleViews.of(ExampleUiSetDef, [foreign])).toThrow(
      'foreign',
    );
  });

  test('два представления одного экрана — бросок', () => {
    const first = ExampleScreenView.for(TaskListScreenDef, () => BODY);
    const again = ExampleScreenView.for(TaskListScreenDef, () => BODY);

    expect(() => ExampleViews.of(ExampleUiSetDef, [first, again])).toThrow(
      ID.list,
    );
  });

  test('два представления одного уведомления — бросок', () => {
    const first = PageNotePresenter.for(TaskAssignedNotificationDef, () => 'a');
    const again = PageNotePresenter.for(TaskAssignedNotificationDef, () => 'b');

    expect(() => ExampleViews.of(ExampleUiSetDef, [first, again])).toThrow(
      ID.assignedNote,
    );
  });

  test('карточка и список — разные представления одного реестра', () => {
    const views = ExampleViews.of(ExampleUiSetDef, [
      ExampleScreenView.for(TaskListScreenDef, () => BODY),
      ExampleScreenView.for(TaskCardScreenDef, () => BODY),
    ]);

    expect([...views.presented()].sort()).toEqual([ID.card, ID.list]);
  });
});

describe('карточка пользователя — модель тела', () => {
  test('пример active: учётная запись и строка активности, без управления', async () => {
    const view = await new ScreenPreview({
      set: ExampleUiSetDef,
      codes: exampleCodes(),
    }).screen(UserCardScreenDef, 'active', {
      locale: 'ru-RU',
      timeZone: 'Asia/Oral',
      delegate: false,
      readOnly: false,
    });

    const body = exampleWebViews
      .screen(ID.user)
      .body(view, { actions: [], forms: [] });

    expect(body).toEqual({
      kind: 'user',
      // `userId` примера `active` — владелец задач учебного набора.
      userId: '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d',
      status: 'Учётная запись активна',
    });
  });
});

describe('уведомления реестра — тексты', () => {
  test('«Вам назначена задача: название»', () => {
    expect(
      exampleWebViews.notification(ID.assignedNote).text({ title: 'Хлеб' }),
    ).toBe('Вам назначена задача: Хлеб');
  });

  test('«Поручение выполнено: название»', () => {
    expect(
      exampleWebViews.notification(ID.completedNote).text({ title: 'Хлеб' }),
    ).toBe('Поручение выполнено: Хлеб');
  });

  test('данные не по схеме — бросок, а не текст', () => {
    expect(() =>
      exampleWebViews.notification(ID.assignedNote).text({ title: 5 }),
    ).toThrow();
  });
});

/** Тело модели нужного вида; другой вид — бросок теста. */
const bodyOf = <K extends ScreenBody['kind']>(
  model: RegionModel,
  kind: K,
): Extract<ScreenBody, { kind: K }> => {
  const body = model.body;
  if (body?.kind !== kind) throw new Error(`ожидалось тело ${kind}`);
  return body as Extract<ScreenBody, { kind: K }>;
};

const action = (actions: readonly ActionModel[], name: string): ActionModel => {
  const found = actions.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`нет действия ${name}`);
  return found;
};

const form = (forms: readonly FormModel[], name: string): FormModel => {
  const found = forms.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error(`нет формы ${name}`);
  return found;
};

const rowOf = (rows: readonly TaskRowModel[], title: string): TaskRowModel => {
  const found = rows.find((row) => row.title === title);
  if (found === undefined) throw new Error(`нет строки ${title}`);
  return found;
};

const names = (items: readonly { name: string }[]) =>
  items.map((item) => item.name).sort();

/** Анна: «Хлеб» (выполнена) и «Молоко» (открыта), список в `main`, карточка «Молоко» в `side`. */
const listed = async () => {
  const w = exampleWorld(tmp().path);
  const a = await openTab(w, TOKEN_ANNA, 'a');
  await a.client.route('/');
  for (const title of ['Хлеб', 'Молоко']) {
    await a.client.submit('main', 'create', { title });
  }
  await a.client.submit('main', 'open', { taskId: 'Хлеб' });
  await a.client.submit('side', 'complete', {});
  await settle(w, a);
  await a.client.submit('main', 'open', { taskId: 'Молоко' });
  await settle(w, a);
  return { w, a, frame: new RegionFrame(), side: new RegionFrame() };
};

describe('экран «Мои задачи» — модель', () => {
  test('две задачи, одна выполнена: строки с признаками', async () => {
    const { a, frame } = await listed();

    const { rows } = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(rows).toHaveLength(2);
    expect(rowOf(rows, 'Хлеб')).toMatchObject({ done: true, selected: false });
    expect(rowOf(rows, 'Молоко')).toMatchObject({
      done: false,
      selected: false,
    });
    for (const row of rows) expect(typeof row.uuid).toBe('string');
  });

  test('открытая задача выбираема и открываема; выполненная — открываема, но не выбираема', async () => {
    const { a, frame } = await listed();

    const { rows } = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(rowOf(rows, 'Хлеб')).toMatchObject({
      selectable: false,
      openable: true,
    });
    expect(rowOf(rows, 'Молоко')).toMatchObject({
      selectable: true,
      openable: true,
    });
  });

  test('отметка по uuid: выбрана только отмеченная строка', async () => {
    const { a, frame } = await listed();
    const first = bodyOf(frame.next(a.client.region('main')), 'list');
    const open = rowOf(first.rows, 'Молоко');

    await a.client.local('main', 'toggle', { taskId: open.uuid });
    const { rows } = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(rowOf(rows, 'Молоко').selected).toBe(true);
    expect(rowOf(rows, 'Хлеб').selected).toBe(false);
  });

  test('«Выполнить выбранные» недоступна без выбора и доступна с выбором', async () => {
    const { a, frame } = await listed();
    const before = bodyOf(frame.next(a.client.region('main')), 'list');
    const open = rowOf(before.rows, 'Молоко');

    expect(action(before.actions, 'completeSelected').enabled).toBe(false);

    await a.client.local('main', 'toggle', { taskId: open.uuid });
    const after = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(action(after.actions, 'completeSelected').enabled).toBe(true);
  });

  test('три открытые задачи: форма «Создать» отключена, enabled false, поле остаётся', async () => {
    const w = exampleWorld(tmp().path);
    const a = await openTab(w, TOKEN_ANNA, 'a');
    await a.client.route('/');
    for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
      await a.client.submit('main', 'create', { title });
    }
    await settle(w, a);

    const { forms } = bodyOf(
      new RegionFrame().next(a.client.region('main')),
      'list',
    );

    expect(form(forms, 'create').enabled).toBe(false);
    expect(form(forms, 'create').fields).toHaveLength(1);
  });

  test('действия без полей — кнопки; открытие и отметка — жесты строк, в кнопки и формы не идут', async () => {
    const { a, frame } = await listed();

    const body = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(names(body.actions)).toEqual([
      'close',
      'completeSelected',
      'next',
      'prev',
    ]);
    expect(names(body.forms)).toEqual(['create', 'jumpTo']);
  });

  test('форма «Создать»: поле «title» с начальным значением «Новая задача»', async () => {
    const { a, frame } = await listed();

    const { forms } = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(form(forms, 'create').enabled).toBe(true);
    expect(form(forms, 'create').fields).toHaveLength(1);
    expect(form(forms, 'create').fields[0]).toMatchObject({
      name: 'title',
      value: 'Новая задача',
      optional: false,
      widget: 'text',
      issues: [],
    });
  });

  test('«Дальше» и «Назад» — по наличию страниц', async () => {
    const { w, a, frame } = await listed();
    await a.client.submit('main', 'create', { title: 'Сыр' });
    await settle(w, a);
    const first = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(action(first.actions, 'next').enabled).toBe(true);
    expect(action(first.actions, 'prev').enabled).toBe(false);

    await a.client.submit('main', 'next', {});
    const second = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(action(second.actions, 'next').enabled).toBe(false);
    expect(action(second.actions, 'prev').enabled).toBe(true);
  });

  test('пустой список — «Задач пока нет.» и ни одной строки', async () => {
    const w = exampleWorld(tmp().path);
    const a = await openTab(w, TOKEN_ANNA, 'a');
    await a.client.route('/');

    const body = bodyOf(
      new RegionFrame().next(a.client.region('main')),
      'list',
    );

    expect(body.rows).toEqual([]);
    expect(body.empty).toBe('Задач пока нет.');
  });

  test('непустой список — текста «пусто» нет', async () => {
    const { a, frame } = await listed();

    expect(
      bodyOf(frame.next(a.client.region('main')), 'list').empty,
    ).toBeUndefined();
  });
});

describe('экран «Задача» — модель', () => {
  test('открытая: «Выполнить» доступно, зона «Выполнено» ждёт, задачу можно тащить', async () => {
    const { a, side } = await listed();

    const model = side.next(a.client.region('side'));
    const card = bodyOf(model, 'card');

    expect(model.title).toBe('Задача');
    expect(card).toMatchObject({
      title: 'Молоко',
      done: false,
      draggable: true,
      zone: 'waiting',
      dropEnabled: true,
    });
    expect(typeof card.uuid).toBe('string');
    expect(action(card.actions, 'complete').enabled).toBe(true);
    expect(action(card.actions, 'back').enabled).toBe(true);
  });

  test('выполненная: «Выполнить» недоступно, зона приняла, тащить нельзя', async () => {
    const { a, side } = await listed();
    await a.client.submit('side', 'complete', {});

    const card = bodyOf(side.next(a.client.region('side')), 'card');

    expect(card).toMatchObject({
      title: 'Молоко',
      done: true,
      draggable: false,
      zone: 'accepted',
      dropEnabled: false,
    });
    expect(action(card.actions, 'complete').enabled).toBe(false);
  });

  test('форма «Назначить»: поле «assigneeId» — выбор человека', async () => {
    const { a, side } = await listed();

    const { forms } = bodyOf(side.next(a.client.region('side')), 'card');

    expect(names(forms)).toEqual(['assign']);
    expect(form(forms, 'assign').fields[0]).toMatchObject({
      name: 'assigneeId',
      widget: 'person',
      optional: false,
      value: '',
    });
  });
});

describe('экран «Назначенные мне» — модель', () => {
  test('пусто — «Поручений нет.»', async () => {
    const w = exampleWorld(tmp().path);
    const b = await openTab(w, TOKEN_BORIS, 'b');
    await b.client.route('/assigned');

    const model = new RegionFrame().next(b.client.region('main'));
    const body = bodyOf(model, 'assigned');

    expect(model.title).toBe('Назначенные мне');
    expect(body.rows).toEqual([]);
    expect(body.empty).toBe('Поручений нет.');
  });

  test('назначенная задача — строка без управления', async () => {
    const { w, a } = await listed();
    const b = await openTab(w, TOKEN_BORIS, 'b');
    await b.client.route('/assigned');
    await a.client.submit('side', 'assign', {
      assigneeId: personOf('boris').uuid,
    });
    await settle(w, a, b);

    const body = bodyOf(
      new RegionFrame().next(b.client.region('main')),
      'assigned',
    );

    expect(body.rows).toHaveLength(1);
    expect(body.rows[0]).toMatchObject({
      title: 'Молоко',
      done: false,
      selected: false,
      selectable: false,
      openable: false,
    });
    expect(body.empty).toBeUndefined();
  });
});

/** Названия действий тела, если у вида тела есть управление; иначе пусто. */
const actionNamesOf = (model: RegionModel): string[] =>
  model.body !== undefined && 'actions' in model.body
    ? names(model.body.actions)
    : [];

describe('экран «Начать работу» — модель', () => {
  test('меню: у тела — действия «tasks» и «assigned», чтобы запускаемый пример вёл по экранам', async () => {
    const w = exampleWorld(tmp().path);
    const a = await openTab(w, TOKEN_ANNA, 'a');
    await a.client.route('/menu');

    const model = new RegionFrame().next(a.client.region('main'));

    expect(model.body?.kind).toBe('menu');
    expect(actionNamesOf(model)).toContain('tasks');
    expect(actionNamesOf(model)).toContain('assigned');
  });
});

describe('экран «Назначенные мне» — действия тела', () => {
  test('у тела — действия «openAssignee» и «close»; выполнение и выбор строк остаются за показом списка', async () => {
    const { w, a } = await listed();
    const b = await openTab(w, TOKEN_BORIS, 'b');
    await b.client.route('/assigned');
    await a.client.submit('side', 'assign', {
      assigneeId: personOf('boris').uuid,
    });
    await settle(w, a, b);

    const model = new RegionFrame().next(b.client.region('main'));

    expect(model.body?.kind).toBe('assigned');
    expect(actionNamesOf(model)).toContain('openAssignee');
    expect(actionNamesOf(model)).toContain('close');
    expect(actionNamesOf(model)).not.toContain('completeSelected');
  });
});
