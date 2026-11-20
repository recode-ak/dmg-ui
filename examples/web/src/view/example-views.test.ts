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
import { examplePagesViews } from 'dmg-ui/web-ui/testing';
import {
  exampleWorld,
  openTab,
  personOf,
  settle,
  TOKEN_ANNA,
  TOKEN_BORIS,
} from '../testing/example-world';
import { ExampleScreenView, ExampleViews } from './example-views';
import { exampleWebViews } from './example-web.views';
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
      [...examplePagesViews.presented()].sort(),
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

  test('формы карточки — «Назначить» и «Напомнить»; в «Назначить» поле «assigneeId» — выбор человека', async () => {
    const { a, side } = await listed();

    const { forms } = bodyOf(side.next(a.client.region('side')), 'card');

    expect(names(forms)).toEqual(['assign', 'remind']);
    expect(form(forms, 'assign').fields[0]).toMatchObject({
      name: 'assigneeId',
      widget: 'person',
      optional: false,
      value: '',
    });
  });

  test('форма «Напомнить»: «Срочно» — чекбокс «Да»/«Нет» без отметки, «Когда» — дата с подсказкой и примером', async () => {
    const { a, side } = await listed();

    const { forms } = bodyOf(side.next(a.client.region('side')), 'card');
    const remind = form(forms, 'remind');

    expect(remind).toMatchObject({ label: 'Напомнить', enabled: true });
    expect(remind.fields).toHaveLength(2);
    expect(remind.fields[0]).toMatchObject({
      name: 'urgent',
      label: 'Срочно',
      widget: 'checkbox',
      optional: false,
      checkbox: { on: 'Да', off: 'Нет', checked: false },
      help: 'Срочное напоминание придёт сразу',
    });
    expect(remind.fields[1]).toMatchObject({
      name: 'remindOn',
      label: 'Когда',
      widget: 'date',
      optional: false,
      value: '',
      help: 'День напоминания; Пример: 2026-12-31',
    });
  });

  test('выполненная задача: «Напомнить» отключена с причиной «Задача уже выполнена»', async () => {
    const { a, side } = await listed();
    await a.client.submit('side', 'complete', {});

    const card = bodyOf(side.next(a.client.region('side')), 'card');

    expect(form(card.forms, 'remind')).toMatchObject({
      enabled: false,
      reason: 'Задача уже выполнена',
    });
    expect(action(card.actions, 'complete')).toMatchObject({
      enabled: false,
      reason: 'Задача уже выполнена',
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

  test('назначенная открытая задача — строка с галочкой: выбираема, не открываема, не отмечена', async () => {
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
      selectable: true,
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
  test('у тела — действия «openAssignee», «close» и «completeSelected»', async () => {
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
    expect(actionNamesOf(model)).toContain('completeSelected');
  });

  test('до отметки «Выполнить выбранные» отключена с причиной «Отметьте открытые задачи»', async () => {
    const { w, a } = await listed();
    const b = await openTab(w, TOKEN_BORIS, 'b');
    await b.client.route('/assigned');
    await a.client.submit('side', 'assign', {
      assigneeId: personOf('boris').uuid,
    });
    await settle(w, a, b);

    const { actions } = bodyOf(
      new RegionFrame().next(b.client.region('main')),
      'assigned',
    );

    expect(action(actions, 'completeSelected')).toMatchObject({
      enabled: false,
      reason: 'Отметьте открытые задачи',
    });
  });
});

/** Анна с открытой задачей «Хлеб» и вкладка Анны, на которой «Назначенные мне» открыты в `region`. */
const selfAssigned = async (region: 'main' | 'modal') => {
  const w = exampleWorld(tmp().path);
  const a = await openTab(w, TOKEN_ANNA, 'a');
  await a.client.route('/');
  await a.client.submit('main', 'create', { title: 'Хлеб' });
  await a.client.submit('main', 'open', { taskId: 'Хлеб' });
  await a.client.submit('side', 'assign', {
    assigneeId: personOf('anna').uuid,
  });
  await settle(w, a);
  if (region === 'main') {
    const other = await openTab(w, TOKEN_ANNA, 'a2');
    await other.client.route('/assigned');
    await settle(w, a, other);
    return { w, a, tab: other, frame: new RegionFrame() };
  }
  await a.client.openLink({
    screen: 'exampleUi/todo/assignedTasks',
    params: {},
  });
  await settle(w, a);
  return { w, a, tab: a, frame: new RegionFrame() };
};

describe.each(['main', 'modal'] as const)(
  'экран «Назначенные мне» в области %s — выбор и выполнение своих поручений',
  (region) => {
    test('у Анны с задачей, назначенной себе: строка выбираема, до отметки действие серое с причиной', async () => {
      const { tab, frame } = await selfAssigned(region);

      const body = bodyOf(frame.next(tab.client.region(region)), 'assigned');

      expect(rowOf(body.rows, 'Хлеб')).toMatchObject({
        selected: false,
        selectable: true,
        openable: false,
      });
      expect(action(body.actions, 'completeSelected')).toMatchObject({
        enabled: false,
        reason: 'Отметьте открытые задачи',
      });
    });

    test('отметка включает «Выполнить выбранные»: строка отмечена, причины нет', async () => {
      const { tab, frame } = await selfAssigned(region);

      await tab.client.local(region, 'toggle', { taskId: 'Хлеб' });
      const body = bodyOf(frame.next(tab.client.region(region)), 'assigned');

      expect(rowOf(body.rows, 'Хлеб').selected).toBe(true);
      expect(action(body.actions, 'completeSelected').enabled).toBe(true);
      expect(action(body.actions, 'completeSelected')).not.toHaveProperty(
        'reason',
      );
    });

    test('подтверждение выполняет: запрос подтверждения, затем строка «выполнена» и уже не выбираема', async () => {
      const { w, a, tab, frame } = await selfAssigned(region);
      await tab.client.local(region, 'toggle', { taskId: 'Хлеб' });

      await tab.client.submit(region, 'completeSelected', {});
      const asked = frame.next(tab.client.region(region));
      await tab.client.confirm(region);
      await settle(w, a, tab);
      const body = bodyOf(frame.next(tab.client.region(region)), 'assigned');

      expect(asked.confirm).toBeDefined();
      expect(rowOf(bodyOf(asked, 'assigned').rows, 'Хлеб').selected).toBe(true);
      expect(rowOf(body.rows, 'Хлеб')).toMatchObject({
        done: true,
        selectable: false,
      });
    });
  },
);

describe('экран «Назначенные мне» — чужое поручение', () => {
  /** Борис создал «Сыр» и назначил Анне; «Назначенные мне» Анны в основной области. */
  const foreign = async () => {
    const w = exampleWorld(tmp().path);
    const b = await openTab(w, TOKEN_BORIS, 'b');
    await b.client.route('/');
    await b.client.submit('main', 'create', { title: 'Сыр' });
    await b.client.submit('main', 'open', { taskId: 'Сыр' });
    await b.client.submit('side', 'assign', {
      assigneeId: personOf('anna').uuid,
    });
    const a = await openTab(w, TOKEN_ANNA, 'a');
    await a.client.route('/assigned');
    await settle(w, a, b);
    return { a, frame: new RegionFrame() };
  };

  test('до отметки действие серое с причиной; после отметки чужого поручения «Выполнить выбранные» скрыто', async () => {
    const { a, frame } = await foreign();

    const before = bodyOf(frame.next(a.client.region('main')), 'assigned');
    await a.client.local('main', 'toggle', { taskId: 'Сыр' });
    const after = bodyOf(frame.next(a.client.region('main')), 'assigned');

    expect(rowOf(before.rows, 'Сыр').selectable).toBe(true);
    expect(action(before.actions, 'completeSelected').enabled).toBe(false);
    expect(rowOf(after.rows, 'Сыр').selected).toBe(true);
    expect(names(after.actions)).not.toContain('completeSelected');
  });
});

describe('экран «Мои задачи» — причины отключённых действий', () => {
  test('«Выполнить выбранные» без выбора — серая с причиной вида', async () => {
    const { a, frame } = await listed();

    const { actions } = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(action(actions, 'completeSelected')).toMatchObject({
      enabled: false,
      reason: 'Отметьте открытые задачи',
    });
  });

  test('после отметки «Выполнить выбранные» доступна и без причины; «Закрыть» — без причины', async () => {
    const { a, frame } = await listed();
    const first = bodyOf(frame.next(a.client.region('main')), 'list');
    await a.client.local('main', 'toggle', {
      taskId: rowOf(first.rows, 'Молоко').uuid,
    });

    const { actions } = bodyOf(frame.next(a.client.region('main')), 'list');

    expect(action(actions, 'completeSelected').enabled).toBe(true);
    expect(action(actions, 'completeSelected')).not.toHaveProperty('reason');
    expect(action(actions, 'close')).not.toHaveProperty('reason');
  });
});
