import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppGraph } from 'dmg-core/graph';
import { useTempDir } from 'dmg-core/testing';
import { ExampleAppDef } from 'dmg-core/testing/example';
import { type HelpSheet, ScreenHelp } from 'dmg-ui';
import type { ConversationExit } from 'dmg-ui/chat-ui';
import {
  ExampleDialogAppDef,
  ExampleTrimmedDialogAppDef,
} from 'dmg-ui/chat-ui/testing';
import { UiGraphProvider } from 'dmg-ui/graph';
import {
  ASSIGNED_ID,
  ExampleUiSetDef,
  exampleCodes,
  FollowAssignedStoryDef,
  LIST_ID,
  MainMenuScreenDef,
  type MemoryUiObserver,
  TaskListScreenDef,
  UserCardScreenDef,
  ViewUserStoryDef,
} from 'dmg-ui/testing';
import { oplogRecords } from 'dmg-ui/testing/fixtures';
import type { PageHistoryEntry, PagePlacement } from 'dmg-ui/web-ui';
import {
  ExamplePagesAppDef,
  exampleWindowPlacements,
  MemoryPageHistory,
} from 'dmg-ui/web-ui/testing';
import * as v from 'valibot';
import {
  A,
  AcceptanceWorld,
  B,
  C,
  type WorldOptions,
} from './support/acceptance-world';
import { LiarAssignedCode } from './support/liar-assigned.code';
import type { PageTab } from './support/page-tab';

// Приёмка семи сценариев и нейтральности ядра на двух каналах — беседе
// (подставной мессенджер) и странице (клиент на проводе в памяти) — над одним
// кодом экранов, одними экранами и сторис. Общий мир, люди и вкладки — в
// `support/`; здесь только сценарии.
//
// | сценарий источника                                 | сценарий набора                                              | describe     |
// |----------------------------------------------------|--------------------------------------------------------------|--------------|
// | 1 менторы: действия разным людям, сразу при выделении | «Выполнить выбранные» по роли и праву над выделенным, без запроса | сценарий 1   |
// | 2 школа → менторы → карточка ментора → карточка пользователя → обратно | «Назначенные мне» → карточка исполнителя → обратно тем же путём; «К моим задачам» — шаг, «Назад» по пути | сценарий 2   |
// | 3 в боте нет управления ценностями                 | беседа без `viewUser`, экран тот же                          | сценарий 3   |
// | 4 «Менторы» без менторов: видно, но закрыто        | `createTask` закрыт правилом лимита, с текстом отказа        | сценарий 4   |
// | 5 поле email с пояснением                          | `jumpTo.part` (число 1…99), `create.title` (строка с подсказкой и примером) | сценарий 5   |
// | 6 мастерская → окно → действия → закрыл → «Назад» в школу | меню → «Мои задачи» → окно над списком → «Назад»; листание — замена, «Назад» возвращает пройденный экран | сценарий 6   |
// | 7 справка по живому экрану                         | `/help`: одно содержание в беседе и на странице, скрытого нет, `/help` не вызывает UC | сценарий 7   |
// | нейтральность: один код экранов                    | исходы и состояние равны, общий набор, порт выхода           | нейтральность |
//
// Лог операций между каналами не сравнивается: страничный канал держит
// открытым и перечитывает список.

const tmp = useTempDir('dmg-ui-channels-story-');

/** Мир приёмки со своим каталогом данных `name`. */
const worldOf = (name: string, options: Omit<WorldOptions, 'dataDir'> = {}) =>
  new AcceptanceWorld({ dataDir: join(tmp().path, name), ...options });

const TITLE = 'Хлеб';
const SECOND = 'Молоко';
const COMPLETE_ALL = 'Выполнить выбранные';
const COMPLETE_ALL_OFF = '🚫 Выполнить выбранные';
const TOGGLE = 'Отметить задачу';
const LIMIT_TEXT = 'Слишком много открытых задач';
const CREATE = 'Создать задачу';
const CREATE_OFF = '🚫 Создать задачу';
const CARD = 'Карточка исполнителя';
const USER_CARD = 'exampleUi/users/userCard';
const MENU_ID = 'exampleUi/todo/mainMenu';
const MENU_LABELS = ['Мои задачи', 'Назначенные мне', 'Закрыть'];
/** Подписи из Def: листание назад и переход «К моим задачам»; «Назад» — автокнопка канала, не действие экрана. */
const PREV = TaskListScreenDef.actions.prev.label;
const toTasks = () => UserCardScreenDef.actions.tasks.label;
const BACK = 'Назад';
/** Подпись без пометки отключённого («🚫 »): для сравнения подписей на живом экране. */
const bare = (label: string) => label.replace(/^🚫 /, '');

/** Метки записи истории: сколько своих записей позади и положена ли она открытием слоя. */
const Marks = v.object({
  depth: v.optional(v.number(), 0),
  over: v.optional(v.boolean(), false),
});
const marksOf = (entry: PageHistoryEntry | undefined) =>
  v.parse(Marks, JSON.parse(String(entry?.record)));

/** Снимок беседы: экран и путь, которых после принятого выхода нет. */
const Saved = v.object({
  screen: v.optional(v.unknown()),
  path: v.optional(v.unknown()),
});

/** Снимок беседы: черновик входа с полями, которые беседа спросит. */
const Draft = v.object({
  draft: v.object({ fields: v.array(v.unknown()) }),
});

describe('сценарий 1 — «Выполнить выбранные» по роли и праву над выделенным, без запроса', () => {
  describe('беседа', () => {
    test('выделение: «Выполнить выбранные» до «Отметить задачу» помечено, после — обычное; UC при выделении не вызывается', async () => {
      const w = worldOf('select');
      await w.createTask(A, 'Хлеб');
      const a = w.person(A);
      await a.enter('start');
      const before = w.calls.length;
      const disabled = a.labels();

      await a.press(TOGGLE);
      await a.press('Хлеб');

      expect(disabled).not.toContain(COMPLETE_ALL);
      expect(disabled).toContain(COMPLETE_ALL_OFF);
      expect(a.labels()).toContain(COMPLETE_ALL);
      expect(a.labels()).not.toContain(COMPLETE_ALL_OFF);
      expect(w.calls).toHaveLength(before);
    });

    test('роль и право: исполнитель-не-владелец выбрал поручение — «Выполнить выбранные» скрыто: ни обычного, ни помеченного', async () => {
      const w = worldOf('roles-b');
      await w.assignedToBAndC();
      const b = w.person(B);

      await b.enter('assigned');
      await b.select('Хлеб');

      expect(b.labels()).not.toContain(COMPLETE_ALL);
      expect(b.labels()).not.toContain(COMPLETE_ALL_OFF);
    });

    test('роль и право: администратор выбрал поручение — «Выполнить выбранные» есть, выполнение проходит', async () => {
      const w = worldOf('roles-c');
      await w.assignedToBAndC();
      const c = w.person(C);

      await c.enter('assigned');
      await c.select('Молоко');
      await c.press(COMPLETE_ALL);
      await c.confirm();
      await c.settle();

      expect(await w.tasksOf()).toEqual([
        { title: 'Хлеб', status: 'open' },
        { title: 'Молоко', status: 'done' },
      ]);
    });

    test('смена роли между показами: следующий показ с новым ответом', async () => {
      const w = worldOf('role-change');
      await w.assignedToBAndC();
      const b = w.person(B);
      await b.enter('assigned');
      await b.select('Хлеб');
      const before = b.labels();

      w.administrators.add(B);
      await b.enter('assigned');
      await b.select('Хлеб');

      expect(before).not.toContain(COMPLETE_ALL);
      expect(before).not.toContain(COMPLETE_ALL_OFF);
      expect(b.labels()).toContain(COMPLETE_ALL);
    });

    test('ложное «доступно»: исполнитель нажимает «Выполнить выбранные» — ACCESS_DENIED с denyMessage, статусы прежние', async () => {
      const w = worldOf('liar', {
        codes: exampleCodes({ assigned: new LiarAssignedCode() }),
      });
      const task = await w.createTask(A, 'Хлеб');
      await w.assignTask(A, task, B);
      const b = w.person(B);
      await b.enter('assigned');
      await b.press(TOGGLE);
      await b.press('Хлеб');
      expect(b.labels()).toContain(COMPLETE_ALL);

      await b.press(COMPLETE_ALL);
      await b.confirm();
      await b.settle();

      expect(w.observer.records).toContainEqual(
        expect.objectContaining({ kind: 'refused', code: 'ACCESS_DENIED' }),
      );
      expect(JSON.stringify(w.messenger.journal)).toContain(
        'Управлять набором задач может владелец каждой из них или администратор.',
      );
      expect(await w.tasksOf()).toEqual([{ title: 'Хлеб', status: 'open' }]);
    });
  });

  describe('страница', () => {
    test('выделение: форма «Выполнить выбранные» — available false с причиной до выделения, true после, UC не вызывается', async () => {
      const w = worldOf('page-select');
      await w.createTask(A, 'Хлеб');
      const a = await w.tab(A);
      await a.client.route('/');
      const before = w.calls.length;
      const off = a.form('completeSelected');

      await a.client.local('main', 'toggle', { taskId: 'Хлеб' });

      expect(off?.available).toBe(false);
      expect(a.form('completeSelected')?.available).toBe(true);
      expect(a.form('completeSelected')).not.toHaveProperty('reason');
      expect(w.calls).toHaveLength(before);
      expect(off?.reason).toBe('Отметьте открытые задачи');
    });

    test('роль и право: исполнитель-не-владелец выбрал поручение — формы выполнения нет', async () => {
      const w = worldOf('page-roles-b');
      await w.assignedToBAndC();
      const b = await w.tab(B);
      await b.client.route('/assigned');

      await b.client.local('main', 'toggle', { taskId: 'Хлеб' });

      expect(b.form('completeSelected')).toBeUndefined();
    });

    test('роль и право: администратор выбрал поручение — форма доступна, выполнение проходит', async () => {
      const w = worldOf('page-roles-c');
      await w.assignedToBAndC();
      const c = await w.tab(C);
      await c.client.route('/assigned');

      await c.client.local('main', 'toggle', { taskId: 'Молоко' });
      const selected = c.form('completeSelected');
      const asked = await c.client.submit('main', 'completeSelected', {});
      const done = await c.client.confirm('main');
      await w.bus.delivered();
      await c.wire.settled();

      expect(selected?.available).toBe(true);
      expect(asked).toMatchObject({ kind: 'confirm' });
      expect(done).toMatchObject({ kind: 'stayed' });
      expect(await w.tasksOf()).toEqual([
        { title: 'Хлеб', status: 'open' },
        { title: 'Молоко', status: 'done' },
      ]);
    });

    test('ложное «доступно»: прямой call completeTasks через провод страницы от исполнителя — ACCESS_DENIED, статусы прежние', async () => {
      const w = worldOf('page-direct');
      const task = await w.createTask(A, 'Хлеб');
      await w.assignTask(A, task, B);

      const received = await w.directCall(B, {
        uc: 'completeTasks',
        input: { taskIds: [task] },
      });

      expect(received).toContainEqual({
        kind: 'result',
        id: 'c1',
        result: expect.objectContaining({
          ok: false,
          error: expect.objectContaining({ code: 'ACCESS_DENIED' }),
        }),
      });
      expect(await w.tasksOf()).toEqual([{ title: 'Хлеб', status: 'open' }]);
    });

    test('смена роли: новое соединение исполнителя, ставшего администратором, — форма выполнения доступна', async () => {
      const w = worldOf('page-role-change');
      await w.assignedToBAndC();
      const before = await w.tab(B);
      await before.client.route('/assigned');
      await before.client.local('main', 'toggle', { taskId: 'Хлеб' });

      w.administrators.add(B);
      const after = await w.tab(B);
      await after.client.route('/assigned');
      await after.client.local('main', 'toggle', { taskId: 'Хлеб' });

      expect(before.form('completeSelected')).toBeUndefined();
      expect(after.form('completeSelected')?.available).toBe(true);
    });

    test('ложное «доступно» через код экрана: форма «Выполнить выбранные» есть, отправка исполнителем — ACCESS_DENIED с текстом, статусы прежние', async () => {
      const w = worldOf('page-liar', {
        codes: exampleCodes({ assigned: new LiarAssignedCode() }),
      });
      const task = await w.createTask(A, 'Хлеб');
      await w.assignTask(A, task, B);
      const b = await w.tab(B);
      await b.client.route('/assigned');
      await b.client.local('main', 'toggle', { taskId: 'Хлеб' });
      expect(b.form('completeSelected')?.available).toBe(true);

      const asked = await b.client.submit('main', 'completeSelected', {});
      const done = await b.client.confirm('main');
      await b.wire.settled();

      expect(asked).toMatchObject({ kind: 'confirm' });
      expect(done).toEqual({
        kind: 'refused',
        refusal: {
          code: 'ACCESS_DENIED',
          text: 'Управлять набором задач может владелец каждой из них или администратор.',
          caught: false,
        },
      });
      expect(w.observer.records).toContainEqual(
        expect.objectContaining({ kind: 'refused', code: 'ACCESS_DENIED' }),
      );
      expect(await w.tasksOf()).toEqual([{ title: 'Хлеб', status: 'open' }]);
    });
  });
});

describe('сценарий 2 — «Назначенные мне» → карточка исполнителя → обратно тем же путём', () => {
  /**
   * Основная беседа: A открыл «Назначенные мне» и карточку исполнителя; пока он
   * на карточке, B назначает ему вторую задачу; A нажимает «Закрыть».
   */
  const returnFromCard = async () => {
    const w = worldOf('dialog-return');
    const a = w.person(A);
    await w.assignToA();
    await a.enter('assigned');
    await a.press(CARD);
    await w.assignToA(SECOND);
    await a.press('Закрыть');
    await a.settled();
    return { w, a };
  };

  /**
   * Страница A на `/assigned`: у него одно поручение, открыта карточка
   * исполнителя; пока она открыта, B назначает ему вторую задачу.
   */
  const cardOnPage = async () => {
    const history = new MemoryPageHistory('/assigned');
    const w = worldOf('pages-return');
    const tab = await w.tab(A, { history });
    await w.assignToA();
    await tab.client.boot();
    await tab.client.submit('main', 'openAssignee', {});
    await tab.wire.settled();
    await w.assignToA(SECOND);
    await tab.wire.settled();
    return { w, tab, history };
  };

  test('страница: нажатие открывает карточку исполнителя с активной учётной записью', async () => {
    const w = worldOf('pages-card');
    const tab = await w.tab(A);
    await w.assignToA();
    await tab.client.route('/assigned');

    const outcome = await tab.client.submit('main', 'openAssignee', {});
    await tab.wire.settled();

    expect(outcome).toMatchObject({ kind: 'moved' });
    const card = (['main', 'side', 'modal'] as const)
      .map((region) => tab.client.region(region))
      .find((state) => state.view?.screen === USER_CARD);
    expect(card?.view?.data).toMatchObject({ userId: A, active: true });
  });

  test('основная беседа: нажатие открывает карточку исполнителя', async () => {
    const w = worldOf('dialog-card');
    const a = w.person(A);
    await w.assignToA();
    await a.enter('assigned');

    await a.press(CARD);
    await a.settled();

    expect(
      w.observer.records.filter(
        (r) =>
          r.kind === 'outcome' && r.outcome === 'moved' && r.to === USER_CARD,
      ),
    ).toHaveLength(1);
    expect(getUserResults(w)).toEqual([true]);
    expect(a.liveText()).toContain('Учётная запись активна');
  });

  test('беседа, возврат с карточки исполнителя: список поручений перечитан — обе задачи', async () => {
    const { a } = await returnFromCard();

    expect(a.liveText()).toStartWith(
      'Карточка просмотрена\n\nПользователь закрыл карточку.\n\n',
    );
    expect(a.liveText()).toContain(TITLE);
    expect(a.liveText()).toContain(SECOND);
  });

  test('беседа, возврат с карточки исполнителя: снова «Назначенные мне», путь снят — «Назад» нет', async () => {
    const { a } = await returnFromCard();

    expect(a.labels()).toContain(CARD);
    expect(a.labels()).not.toContain('Назад');
  });

  test('страница, карточка исполнителя: открытие — запись с over, карточка в side; список поручений перечитан по событию назначения', async () => {
    const p = await cardOnPage();

    expect(p.tab.client.region('side').view?.screen).toBe(USER_CARD);
    expect(p.history.position).toBe(1);
    expect(marksOf(p.history.current())).toEqual({ depth: 1, over: true });
    expect(p.tab.titles().sort()).toEqual([SECOND, TITLE]);
  });

  test('страница, возврат с карточки исполнителя: карточка закрыта, main — тот же экран и объект, позиция истории прежняя, записей не прибавилось', async () => {
    const p = await cardOnPage();
    const main = p.tab.client.region('main');

    const outcome = await p.tab.client.submit('side', 'close', {});
    await p.tab.wire.settled();
    await p.history.settled();

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
    expect(p.tab.client.region('side').status).toBe('empty');
    expect(p.tab.client.region('main')).toBe(main);
    expect(p.tab.titles().sort()).toEqual([SECOND, TITLE]);
    expect(p.history.position).toBe(0);
    expect(p.history.pushes).toBe(1);
    expect(p.history.entries()).toHaveLength(2);
  });

  test('страница, «Назад» браузера при открытой карточке: карточка закрыта, main — тот же объект, позиция истории 0', async () => {
    const p = await cardOnPage();
    const main = p.tab.client.region('main');

    await p.history.back();

    expect(p.tab.client.region('side').status).toBe('empty');
    expect(p.tab.client.region('main')).toBe(main);
    expect(p.history.position).toBe(0);
  });

  test('беседа, вход через меню: «Закрыть» на карточке — «Назначенные мне» с «Назад», «Назад» ведёт в меню', async () => {
    const w = worldOf('dialog-menu-return');
    const a = w.person(A);
    await w.assignToA();
    await a.enter('menu');
    await a.press('Назначенные мне');
    await a.press(CARD);

    await a.press('Закрыть');
    await a.settled();

    expect(a.liveText()).toStartWith(
      'Карточка просмотрена\n\nПользователь закрыл карточку.\n\n',
    );
    expect(a.labels()).toContain(CARD);
    expect(a.labels()).toContain('Назад');
    await a.press('Назад');
    expect(a.labels().slice(0, 3)).toEqual(MENU_LABELS);
    expect(a.labels()).not.toContain('Назад');
  });

  /** Меню → «Назначенные мне» → «Карточка исполнителя» (у A одно поручение). */
  const cardFromMenu = async (name: string) => {
    const w = worldOf(name);
    const a = w.person(A);
    await w.assignToA();
    await a.enter('menu');
    await a.press('Назначенные мне');
    await a.press(CARD);
    return a;
  };

  test('беседа, карточка исполнителя: варианты «К моим задачам», «Закрыть» и автокнопка «Назад» последней', async () => {
    const a = await cardFromMenu('dialog-tasks-labels');

    expect(a.labels()).toEqual([toTasks(), 'Закрыть', BACK]);
  });

  test('беседа, «К моим задачам»: «Мои задачи» с «Назад» в конце; три «Назад» подряд — карточка, «Назначенные мне», меню', async () => {
    const a = await cardFromMenu('dialog-tasks-chain');

    await a.press(toTasks());

    expect(a.liveText()).toStartWith('Мои задачи');
    expect(a.labels().at(-1)).toBe(BACK);
    await a.press(BACK);
    expect(a.liveText()).toContain('Учётная запись активна');
    expect(a.labels()).toContain(toTasks());
    await a.press(BACK);
    expect(a.labels()).toContain(CARD);
    expect(a.labels()).toContain(BACK);
    await a.press(BACK);
    expect(a.labels().slice(0, 3)).toEqual(MENU_LABELS);
    expect(a.labels()).not.toContain(BACK);
  });

  test('страница, «К моим задачам» в панели карточки: исход moved на список в main, панель остаётся; «Назад» браузера — «Назначенные мне» с панелью, ещё «Назад» — без панели', async () => {
    const p = await cardOnPage();

    const outcome = await p.tab.client.submit('side', 'tasks', {});
    await p.tab.wire.settled();
    await p.history.settled();

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(p.tab.client.region('main').view?.screen).toBe(LIST_ID);
    expect(p.tab.client.region('side').view?.screen).toBe(USER_CARD);
    await p.history.back();
    expect(p.tab.client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(p.tab.client.region('side').view?.screen).toBe(USER_CARD);
    await p.history.back();
    expect(p.tab.client.region('main').view?.screen).toBe(ASSIGNED_ID);
    expect(p.tab.client.region('side').status).toBe('empty');
  });
});

describe('сценарий 3 — беседа без viewUser, экран тот же', () => {
  test('беседа без viewUser: у «Назначенные мне» нет карточки исполнителя', async () => {
    const w = worldOf('dialog-trimmed', {
      dialogApp: ExampleTrimmedDialogAppDef,
    });
    const a = w.person(A);
    await w.assignToA();

    await a.enter('assigned');

    expect(a.labels()).toContain('Закрыть');
    expect(a.labels()).not.toContain(CARD);
  });

  test('страница: у «Назначенные мне» есть действие карточки исполнителя', async () => {
    const w = worldOf('pages-assigned');
    const tab = await w.tab(A);
    await w.assignToA();

    await tab.client.route('/assigned');

    const actions = tab.client.region('main').view?.actions.map((a) => a.name);
    expect(actions).toContain('openAssignee');
  });

  test('приложения беседы — основное и без карточки пользователя — делят один набор', () => {
    expect(ExampleTrimmedDialogAppDef.set).toBe(ExampleDialogAppDef.set);
  });
});

describe('сценарий 4 — createTask закрыт правилом лимита, с текстом отказа', () => {
  describe('беседа', () => {
    test('предел открытых: у владельца трёх открытых «Создать задачу» нет, свободный текст отвечает причиной, задач по-прежнему три', async () => {
      const w = worldOf('limit');
      for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
        await w.createTask(A, title);
      }
      const a = w.person(A);
      await a.enter('start');

      await a.say('Яйца');

      expect(a.labels()).not.toContain(CREATE);
      expect(a.labels()).toContain(CREATE_OFF);
      expect(a.text()).toContain(LIMIT_TEXT);
      expect(a.text()).not.toContain('Выберите вариант');
      expect(w.calls).not.toContain('createTask');
      expect(await w.tasksOf()).toHaveLength(3);
    });

    test('две открытые: «Создать задачу» есть, текст запускает создание', async () => {
      const w = worldOf('two');
      for (const title of ['Хлеб', 'Молоко']) await w.createTask(A, title);
      const a = w.person(A);
      await a.enter('start');

      expect(a.labels()).toContain(CREATE);
      expect(a.labels()).not.toContain(CREATE_OFF);
      await a.say('Сыр');
      await a.settle();

      expect(await w.tasksOf()).toHaveLength(3);
    });

    test('возврат доступности: после выполнения одной из трёх открытых «Создать задачу» снова есть', async () => {
      const w = worldOf('limit-return');
      for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
        await w.createTask(A, title);
      }
      const a = w.person(A);
      await a.enter('start');
      const before = a.labels();

      await a.press('Открыть задачу');
      await a.press('Хлеб');
      await a.press('Выполнить');
      await a.settle();
      await a.press('К списку');

      expect(before).not.toContain(CREATE);
      expect(before).toContain(CREATE_OFF);
      expect(a.labels()).toContain(CREATE);
      expect(a.labels()).not.toContain(CREATE_OFF);
    });

    test('нажатие помеченного «Создать задачу» при трёх открытых — ответ с причиной, UC не вызван, задач по-прежнему три, подписи прежние', async () => {
      const w = worldOf('limit-press');
      for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
        await w.createTask(A, title);
      }
      const a = w.person(A);
      await a.enter('start');
      const labels = a.labels();
      const calls = w.calls.length;

      await a.press(CREATE_OFF);
      await a.settle();

      const answers = w.messenger.journal.filter((r) => r.op === 'answered');
      expect(answers).toEqual([
        expect.objectContaining({ peer: 'peer-a', text: LIMIT_TEXT }),
      ]);
      expect(w.calls).toHaveLength(calls);
      expect(w.calls).not.toContain('createTask');
      expect(await w.tasksOf()).toHaveLength(3);
      expect(a.labels()).toEqual(labels);
    });
  });

  describe('страница', () => {
    test('возврат доступности: три открытые — форма «Создать» закрыта, после выполнения одной — доступна и без причины', async () => {
      const w = worldOf('page-limit-return');
      for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
        await w.createTask(A, title);
      }
      const a = await w.tab(A);
      await a.client.route('/');
      expect(a.form('create')?.available).toBe(false);

      await a.client.submit('main', 'open', { taskId: 'Хлеб' });
      await a.client.submit('side', 'complete', {});
      await w.bus.delivered();
      await a.wire.settled();

      expect(a.form('create')?.available).toBe(true);
      expect(a.form('create')).not.toHaveProperty('reason');
    });

    test('предел открытых: у владельца трёх открытых форма «Создать» — available false с причиной, отправка — unavailable disabled, UC не вызван', async () => {
      const w = worldOf('page-limit');
      for (const title of ['Хлеб', 'Молоко', 'Сыр']) {
        await w.createTask(A, title);
      }
      const a = await w.tab(A);
      await a.client.route('/');

      const outcome = await a.client.submit('main', 'create', {
        title: 'Яйца',
      });

      expect(a.form('create')?.available).toBe(false);
      expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
      expect(w.calls).not.toContain('createTask');
      expect(await w.tasksOf()).toHaveLength(3);
      expect(a.form('create')?.reason).toBe(LIMIT_TEXT);
    });
  });
});

describe('сценарий 5 — поле входа: подпись, подсказка, пример и пределы из схемы', () => {
  // Вид поля (подпись, подсказка, пример, пределы, вид) берётся из схемы
  // действия ядром и одинаков на двух каналах и в графе; число из текста
  // приводит ядро, схема отвергает не число и выход за предел своим текстом.
  // Действие `jumpTo` списка задач — поле `part` с пределами 1…99; `create` —
  // строковое поле с подсказкой и примером. Каналы узнают о поле только из
  // вида экрана.
  const PART_FIELD = {
    name: 'part',
    label: 'Часть',
    kind: 'number',
    optional: false,
    hint: 'Номер части списка, с первой',
    example: 2,
    limits: { min: 1, max: 99, integer: true },
  };
  const PART_QUESTION = [
    'Введите: Часть',
    'Номер части списка, с первой',
    'Пример: 2',
    'Пределы: от 1 до 99, целое',
  ].join('\n');
  const THREE = ['Хлеб', 'Молоко', 'Сыр'];

  /** Узел графа: свойства схемы входа действия `action` экрана `screen` (по умолчанию списка). */
  const graphInput = (action: string, screen = 'taskList') => {
    const graph = new AppGraph({
      def: ExampleAppDef,
      providers: [
        new UiGraphProvider({
          set: ExampleUiSetDef,
          apps: [ExamplePagesAppDef],
        }),
      ],
    }).build();
    const props = graph.node(`exampleUi/todo/${screen}/${action}`)?.props;
    return v.parse(
      v.object({
        input: v.object({
          properties: v.record(v.string(), v.record(v.string(), v.unknown())),
        }),
      }),
      props,
    ).input.properties;
  };

  /** Беседа A на списке с тремя задачами: список — часть 1. */
  const dialogList = async (name: string) => {
    const w = worldOf(name);
    for (const title of THREE) await w.ownTask(title);
    const a = w.person(A);
    await a.enter('start');
    return { w, a };
  };

  /** Страница A на списке с тремя задачами. */
  const pageList = async (name: string) => {
    const w = worldOf(name);
    const tab = await w.tab(A);
    for (const title of THREE) await w.ownTask(title);
    await tab.client.route('/');
    return { w, tab };
  };

  test('поле part: вид — подпись, подсказка, пример, пределы, kind number — одинаков в беседе и на странице', async () => {
    const d = await dialogList('field-dialog-view');
    await d.a.press('К части');
    const asked = v.parse(Draft, await d.w.store.load('peer-a')).draft.fields;
    const p = await pageList('field-pages-view');

    const onPage = p.tab.field('jumpTo', 'part');

    expect(onPage).toMatchObject(PART_FIELD);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toEqual(onPage);
  });

  test('беседа, jumpTo: вопрос с подсказкой, примером и пределами; «abc» — замечание схемы; «2» — часть 2', async () => {
    const d = await dialogList('field-dialog-jump');
    const first = d.a.text();

    await d.a.press('К части');
    const question = d.a.text();
    await d.a.say('abc');
    const noted = d.a.text();
    await d.a.say('2');
    await d.a.settled();
    const second = d.a.text();

    expect(question).toBe(PART_QUESTION);
    expect(noted).toBe(`Введите номер части\n\n${PART_QUESTION}`);
    const shown = (text: string) => THREE.filter((t) => text.includes(t));
    expect(shown(first)).toHaveLength(2);
    expect(shown(second)).toHaveLength(1);
  });

  test('беседа, jumpTo: «0» — замечание о пределе её текстом, вопрос повторён', async () => {
    const d = await dialogList('field-dialog-zero');
    await d.a.press('К части');

    await d.a.say('0');

    expect(d.a.text()).toBe(`Части начинаются с первой\n\n${PART_QUESTION}`);
  });

  test('страница, jumpTo { part: «2» }: движение на адрес с page 1, на странице одна задача', async () => {
    const p = await pageList('field-pages-jump');
    expect(p.tab.titles()).toHaveLength(2);

    const outcome = await p.tab.client.submit('main', 'jumpTo', { part: '2' });
    await p.tab.wire.settled();

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(p.tab.client.region('main').view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 1 },
    });
    expect(p.tab.titles()).toHaveLength(1);
  });

  test('страница, jumpTo { part: «0» }: rejected, замечание у поля part, форма и введённое остались', async () => {
    const p = await pageList('field-pages-zero');

    const outcome = await p.tab.client.submit('main', 'jumpTo', { part: '0' });

    expect(outcome).toMatchObject({ kind: 'rejected' });
    const state = p.tab.client.region('main');
    expect(state.view?.address).toEqual({
      screen: LIST_ID,
      params: { page: 0 },
    });
    expect(state.issues).toEqual([
      { field: 'part', text: 'Части начинаются с первой' },
    ]);
    expect(p.tab.form('jumpTo')?.fields).toMatchObject([
      {
        value: '0',
        issues: ['Части начинаются с первой'],
        ...PART_FIELD,
      },
    ]);
  });

  test('страница, jumpTo { part: «abc» }: rejected текстом схемы, вызов не ушёл', async () => {
    const p = await pageList('field-pages-abc');

    const outcome = await p.tab.client.submit('main', 'jumpTo', {
      part: 'abc',
    });

    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect(p.tab.client.region('main').issues).toEqual([
      { field: 'part', text: 'Введите номер части' },
    ]);
  });

  test('create.title: подсказка и пример в виде поля и в вопросе беседы; на странице — в форме', async () => {
    const w = worldOf('field-dialog-title');
    const a = w.person(A);
    await a.enter('start');
    await a.press('Создать задачу');
    const p = await pageList('field-pages-title');

    const onPage = p.tab.field('create', 'title');

    expect(a.text()).toStartWith(
      'Введите: Название задачи\nКоротко: что нужно сделать\nПример: Купить хлеб',
    );
    expect(onPage).toMatchObject({
      label: 'Название задачи',
      kind: 'string',
      hint: 'Коротко: что нужно сделать',
      example: 'Купить хлеб',
    });
    const asked = v.parse(Draft, await w.store.load('peer-a')).draft.fields;
    expect(asked[0]).toEqual(onPage);
  });

  describe('действие remind карточки: булево и дата', () => {
    // Поля `urgent` (булево) и `remindOn` (дата) — действие без UC; каналы
    // узнают о них только из вида: подсказка, пример и «Да»/«Нет» одни и те же.
    const URGENT_QUESTION =
      'Выберите: Срочно\nСрочное напоминание придёт сразу';
    const DATE_QUESTION = [
      'Введите: Когда',
      'День напоминания',
      'Пример: 2026-12-31',
    ].join('\n');
    const DATE_ISSUE = 'Дата в виде ГГГГ-ММ-ДД';
    const MUTATING = [
      'createTask',
      'completeTask',
      'completeTasks',
      'assignTask',
    ];

    /** Беседа A на карточке «Хлеб». */
    const dialogCard = async (name: string) => {
      const w = worldOf(name);
      await w.ownTask(TITLE);
      const a = w.person(A);
      await a.enter('start');
      await a.press('Открыть задачу');
      await a.press(TITLE);
      return { w, a };
    };

    /** Страница A: список в `main`, карточка «Хлеб» в `side`. */
    const pageCard = async (name: string) => {
      const w = worldOf(name);
      const tab = await w.tab(A);
      await w.ownTask(TITLE);
      await tab.client.route('/');
      await tab.client.submit('main', 'open', { taskId: TITLE });
      await tab.wire.settled();
      return { w, tab };
    };

    /** Поля действия `remind` в виде соседней области страницы. */
    const remindFields = (tab: PageTab) =>
      tab.client
        .region('side')
        .view?.actions.find((action) => action.name === 'remind')?.fields ?? [];

    test('вид полей: в беседе (черновик) и на странице одинаков — подпись, подсказка, пример, kind', async () => {
      const d = await dialogCard('remind-dialog-view');
      await d.a.press('Напомнить');
      const asked = v.parse(Draft, await d.w.store.load('peer-a')).draft.fields;
      const p = await pageCard('remind-pages-view');

      const onPage = remindFields(p.tab);

      expect(onPage).toMatchObject([
        {
          name: 'urgent',
          label: 'Срочно',
          kind: 'boolean',
          optional: false,
          hint: 'Срочное напоминание придёт сразу',
        },
        {
          name: 'remindOn',
          label: 'Когда',
          kind: 'date',
          optional: false,
          hint: 'День напоминания',
          example: '2026-12-31',
        },
      ]);
      expect(onPage[0]).not.toHaveProperty('example');
      expect(asked).toEqual([...onPage]);
    });

    test('беседа: «Срочно» — вопрос с подсказкой и кнопками «Да» и «Нет»; «Когда» — подсказка и пример', async () => {
      const d = await dialogCard('remind-dialog-ask');

      await d.a.press('Напомнить');
      const urgent = d.a.liveText();
      const urgentOptions = d.a.labels();
      await d.a.press('Да');
      const when = d.a.text();

      expect(urgent).toBe(URGENT_QUESTION);
      expect(urgentOptions).toEqual(expect.arrayContaining(['Да', 'Нет']));
      expect(when).toBe(DATE_QUESTION);
    });

    test('беседа: «завтра» — замечание схемы перед вопросом; «2026-12-31» — карточка, UC не вызван', async () => {
      const d = await dialogCard('remind-dialog-date');
      await d.a.press('Напомнить');
      await d.a.press('Да');

      await d.a.say('завтра');
      const noted = d.a.text();
      const before = d.w.calls.length;
      await d.a.say('2026-12-31');
      await d.a.settled();

      expect(noted).toBe(`${DATE_ISSUE}\n\n${DATE_QUESTION}`);
      expect(d.a.labels()).toEqual(
        expect.arrayContaining(['Напомнить', 'К списку']),
      );
      for (const uc of MUTATING)
        expect(d.w.calls.slice(before)).not.toContain(uc);
    });

    test('страница: «завтра» — rejected тем же текстом схемы у поля remindOn', async () => {
      const p = await pageCard('remind-pages-reject');

      const outcome = await p.tab.client.submit('side', 'remind', {
        urgent: 'Да',
        remindOn: 'завтра',
      });

      expect(outcome).toMatchObject({ kind: 'rejected' });
      expect(p.tab.client.region('side').issues).toEqual([
        { field: 'remindOn', text: DATE_ISSUE },
      ]);
    });

    test('страница: верные значения — остаётся на карточке (stayed), замечаний нет, UC не вызван', async () => {
      const p = await pageCard('remind-pages-ok');
      const before = p.w.calls.length;

      const outcome = await p.tab.client.submit('side', 'remind', {
        urgent: 'Да',
        remindOn: '2026-12-31',
      });
      await p.tab.wire.settled();

      expect(outcome).toMatchObject({ kind: 'stayed' });
      expect(p.tab.client.region('side').issues).toEqual([]);
      for (const uc of MUTATING)
        expect(p.w.calls.slice(before)).not.toContain(uc);
    });

    test('граф: hint, title и examples полей remind — те же, что в виде полей каналов', async () => {
      const p = await pageCard('remind-graph');
      const [urgent, remindOn] = remindFields(p.tab);

      const input = graphInput('remind', 'taskCard');

      expect(input.urgent).toMatchObject({
        title: urgent?.label,
        hint: urgent?.hint,
      });
      expect(input.urgent).not.toHaveProperty('examples');
      expect(input.remindOn).toMatchObject({
        title: remindOn?.label,
        hint: remindOn?.hint,
        examples: [remindOn?.example],
      });
    });
  });

  test('граф: hint, title, пределы и пример полей part и title — те же, что в виде полей каналов', async () => {
    const p = await pageList('field-graph');
    const part = p.tab.field('jumpTo', 'part');
    const title = p.tab.field('create', 'title');

    const jump = graphInput('jumpTo');
    const create = graphInput('create');

    expect(jump.part).toMatchObject({
      title: part?.label,
      hint: part?.hint,
      minimum: part?.limits?.min,
      maximum: part?.limits?.max,
      examples: [part?.example],
    });
    expect(create.title).toMatchObject({
      title: title?.label,
      hint: title?.hint,
      examples: [title?.example],
    });
  });
});

describe('сценарий 6 — меню → «Мои задачи» → окно над списком → «Назад»', () => {
  /** Окно задачи — размещение примера; список задач — в основной области, под окном. */
  const MENU_PLACEMENTS: readonly PagePlacement[] = [
    { screen: TaskListScreenDef, region: 'main' },
    ...exampleWindowPlacements,
  ];

  /** Меню → «Мои задачи» → задача → «Открыть задачу» → «Выполнить» → «К списку». */
  const completedFromMenu = async () => {
    const w = worldOf('dialog-menu-path');
    const a = w.person(A);
    await a.enter('menu');
    await a.press('Мои задачи');
    await a.say(TITLE);
    await a.press('Открыть задачу');
    await a.press(TITLE);
    await a.press('Выполнить');
    await w.bus.delivered();
    await a.settled();
    await a.press('К списку');
    return a;
  };

  /** Страница A на `/menu`: «Мои задачи», окно задачи, назначение и выполнение в окне. */
  const windowFromMenu = async () => {
    const history = new MemoryPageHistory('/menu');
    const w = worldOf('pages-window');
    const tab = await w.tab(A, { history, placements: MENU_PLACEMENTS });
    await w.ownTask();
    await tab.client.boot();
    await tab.client.submit('main', 'tasks', {});
    await tab.client.submit('main', 'open', { taskId: TITLE });
    await tab.client.submit('modal', 'assign', { assigneeId: B });
    await tab.client.submit('modal', 'complete', {});
    await tab.wire.settled();
    return { w, tab, history };
  };

  /** Меню в основной области, ни окна, ни панели. */
  const expectMenuOnly = (tab: PageTab) => {
    expect(tab.client.region('main').view?.screen).toBe(MENU_ID);
    expect(tab.client.region('modal').status).toBe('empty');
    expect(tab.client.region('side').status).toBe('empty');
  };

  test('беседа, меню: вход menu даёт «Мои задачи», «Назначенные мне» и «Закрыть»', async () => {
    const w = worldOf('dialog-menu');
    const a = w.person(A);

    await a.enter('menu');

    expect(a.labels().slice(0, 3)).toEqual(MENU_LABELS);
  });

  test('беседа, меню → список → карточка → «К списку»: «Назад» ведёт в меню', async () => {
    const a = await completedFromMenu();

    await a.press('Назад');

    expect(a.labels().slice(0, 3)).toEqual(MENU_LABELS);
    expect(a.labels()).not.toContain('Назад');
  });

  test('страница, меню → «Мои задачи» → окно: запись на список, запись открытия окна с over; назначение и выполнение — замены', async () => {
    const p = await windowFromMenu();

    expect(p.tab.client.region('modal').view?.data).toMatchObject({
      status: 'done',
    });
    expect(p.history.entries()).toHaveLength(3);
    expect(p.history.pushes).toBe(2);
    expect(p.history.position).toBe(2);
    expect(p.history.entries().map((entry) => marksOf(entry))).toEqual([
      { depth: 0, over: false },
      { depth: 1, over: false },
      { depth: 2, over: true },
    ]);
  });

  test('страница, закрытие окна client.close: движение назад — список без окна; затем «Назад» — меню', async () => {
    const p = await windowFromMenu();

    p.tab.client.close('modal');
    await p.history.settled();

    expect(p.tab.client.region('modal').status).toBe('empty');
    expect(p.tab.client.region('main').view?.screen).toBe(LIST_ID);
    expect(p.history.position).toBe(1);
    expect(p.history.pushes).toBe(2);
    await p.history.back();
    expectMenuOnly(p.tab);
    expect(p.history.position).toBe(0);
  });

  test('страница, «К списку» в окне: окно закрыто движением назад; затем «Назад» — меню', async () => {
    const p = await windowFromMenu();

    await p.tab.client.submit('modal', 'back', {});
    await p.tab.wire.settled();
    await p.history.settled();

    expect(p.tab.client.region('modal').status).toBe('empty');
    expect(p.tab.client.region('main').view?.screen).toBe(LIST_ID);
    expect(p.history.position).toBe(1);
    expect(p.history.pushes).toBe(2);
    await p.history.back();
    expectMenuOnly(p.tab);
  });

  test('страница, «Назад» при открытом окне закрывает его; следующий «Назад» — меню', async () => {
    const p = await windowFromMenu();

    await p.history.back();

    expect(p.tab.client.region('modal').status).toBe('empty');
    expect(p.tab.client.region('main').view?.screen).toBe(LIST_ID);
    await p.history.back();
    expectMenuOnly(p.tab);
  });

  test('страница, листание — замена записи истории: «Дальше» и «Предыдущая страница» записей не прибавляют', async () => {
    const history = new MemoryPageHistory('/');
    const w = worldOf('pages-paging');
    for (const title of [TITLE, SECOND, 'Сыр']) await w.createTask(A, title);
    const tab = await w.tab(A, { history });
    await tab.client.boot();
    const pushes = history.pushes;
    const entries = history.entries().length;

    await tab.client.submit('main', 'next', {});
    await tab.wire.settled();
    await history.settled();
    expect(history.pushes).toBe(pushes);
    expect(history.entries()).toHaveLength(entries);

    await tab.client.submit('main', 'prev', {});
    await tab.wire.settled();
    await history.settled();
    expect(history.pushes).toBe(pushes);
    expect(history.entries()).toHaveLength(entries);
  });
});

describe('сценарий 7 — справка по живому экрану: одно содержание на двух каналах, скрытого нет', () => {
  const READ_ONLY_TEXT = 'Только чтение: изменения недоступны';
  const SELECT_REASON = 'Отметьте открытые задачи';
  const { actions: menuActions } = MainMenuScreenDef;
  const { actions: listActions } = TaskListScreenDef;

  /** Вид основной области вкладки; нет вида — ошибка сцены. */
  const mainView = (tab: PageTab) => {
    const view = tab.client.region('main').view;
    if (view === undefined) throw new Error('в основной области нет вида');
    return view;
  };

  /** Строки справки беседы: каждый пункт листа — своей строкой «• …». */
  const bullets = (text: string) =>
    text.split('\n').filter((line) => line.startsWith('• '));

  /** Текст беседы называет заголовок, а у каждого пункта листа — подпись, подсказку и причину. */
  const expectText = (text: string, sheet: HelpSheet) => {
    const items = [...sheet.items, ...sheet.leads];
    expect(text).toContain(`Справка: ${sheet.title}`);
    if (sheet.hint !== undefined) expect(text).toContain(sheet.hint);
    expect(bullets(text)).toHaveLength(items.length);
    for (const item of items) {
      const line = bullets(text).find((one) => one.includes(item.label));
      expect(line).toBeDefined();
      if (item.hint !== undefined) expect(line).toContain(item.hint);
      if (item.disabled !== undefined) expect(line).toContain(item.disabled);
    }
  };

  test.each([
    ['меню', 'menu', '/menu'],
    ['«Мои задачи»', 'start', '/'],
  ])(
    '%s: лист справки на одном виде равен для приложений обоих каналов; текст беседы называет те же подписи, подсказки и причины',
    async (_, entry, route) => {
      const w = worldOf(`help-same-${entry}`);
      const a = w.person(A);
      const tab = await w.tab(A);
      await tab.client.route(route);
      const view = mainView(tab);
      const page = new ScreenHelp(ExamplePagesAppDef).of(view);
      const dialog = new ScreenHelp(ExampleDialogAppDef).of(view);

      await a.enter(entry);
      await a.help();

      expect(dialog).toEqual(page);
      expect(page.items.length + page.leads.length).toBeGreaterThan(0);
      expectText(a.text(), page);
    },
  );

  test('беседа, меню: справка показывает подсказку сторис followAssigned у «Назначенные мне»; в самом меню та же строка', async () => {
    const w = worldOf('help-menu-door');
    const a = w.person(A);
    await a.enter('menu');
    const line = `${menuActions.assigned.label} — ${FollowAssignedStoryDef.hint}`;
    expect(a.liveText().split('\n')).toContain(line);

    await a.help();

    expect(a.text().split('\n')).toContain(`• ${line}`);
    expect(a.text()).not.toContain(`${menuActions.tasks.label} —`);
  });

  test('беседа, «Мои задачи»: «Назад» называется по Def, причины отключённого — из вида', async () => {
    const w = worldOf('help-list-reasons');
    const a = w.person(A);
    await a.enter('start');

    await a.help();

    const lines = a.text().split('\n');
    expect(lines).toContain(
      `• ${listActions.prev.label} (недоступно: Это первая страница)`,
    );
    expect(lines).toContain(
      `• ${listActions.completeSelected.label} (недоступно: ${SELECT_REASON})`,
    );
  });

  test('скрытого нет: исполнитель-не-владелец выбрал поручение — «Выполнить выбранные» ни в справке беседы, ни в тексте, ни в листе страницы', async () => {
    const w = worldOf('help-hidden');
    await w.assignedToBAndC();
    const b = w.person(B);
    const tab = await w.tab(B);
    await b.enter('assigned');
    await b.select('Хлеб');
    await tab.client.route('/assigned');
    await tab.client.local('main', 'toggle', { taskId: 'Хлеб' });

    await b.help();

    const sheet = new ScreenHelp(ExamplePagesAppDef).of(mainView(tab));
    const names = [...sheet.items, ...sheet.leads].map((item) => item.name);
    expect(b.text()).toContain('Справка: Назначенные мне');
    expect(b.text()).not.toContain(COMPLETE_ALL);
    expect(names).not.toContain('completeSelected');
    expect(JSON.stringify(sheet)).not.toContain(COMPLETE_ALL);
    expectText(b.text(), sheet);
  });

  test('скрытого нет, но видно положенное: администратор выбрал поручение — «Выполнить выбранные» названо', async () => {
    const w = worldOf('help-admin');
    await w.assignedToBAndC();
    const c = w.person(C);
    await c.enter('assigned');
    await c.select('Молоко');

    await c.help();

    expect(c.text()).toContain(COMPLETE_ALL);
    expect(c.text()).not.toContain('недоступно: Отметьте');
  });

  test('заместитель «только чтение»: действия с UC названы отключёнными с текстом ядра — в беседе и в листе страницы', async () => {
    const w = worldOf('help-deputy');
    await w.ownTask();
    w.deputies.add(A);
    const a = w.person(A);
    const tab = await w.tab(A);
    await tab.client.route('/');
    await a.enter('start');

    await a.help();

    const sheet = new ScreenHelp(ExamplePagesAppDef).of(mainView(tab));
    const reasons = sheet.items.filter(
      (item) => item.disabled === READ_ONLY_TEXT,
    );
    expect(reasons.map((item) => item.name)).toEqual(
      expect.arrayContaining(['create', 'completeSelected']),
    );
    expect(a.text()).toContain(
      `• ${listActions.create.label} (недоступно: ${READ_ONLY_TEXT})`,
    );
    expectText(a.text(), sheet);
  });

  test('отрезанное составом: в приложении без viewUser «Карточка исполнителя» не названа, в основном — названа с подсказкой сторис', async () => {
    const trimmed = worldOf('help-trimmed', {
      dialogApp: ExampleTrimmedDialogAppDef,
    });
    const full = worldOf('help-full');
    const t = trimmed.person(A);
    const f = full.person(A);
    await t.enter('assigned');
    await f.enter('assigned');

    await t.help();
    await f.help();

    expect(t.text()).not.toContain(CARD);
    expect(f.text()).toContain(`• ${CARD} — ${ViewUserStoryDef.hint}`);
  });

  test('/help не вызывает UC и не меняет экран: вызовы и записи действий прежние, подписи и текст живого места те же, кнопки живы', async () => {
    const w = worldOf('help-untouched');
    await w.ownTask();
    const a = w.person(A);
    await a.enter('start');
    const calls = [...w.calls];
    const acted = w.observer.records.filter((r) => r.kind === 'acted').length;
    const labels = a.labels();
    const live = a.liveText();

    await a.help();
    await a.help();

    expect(w.calls).toEqual(calls);
    expect(w.observer.records.filter((r) => r.kind === 'acted')).toHaveLength(
      acted,
    );
    expect(a.labels()).toEqual(labels);
    expect(a.liveText()).toBe(live);
    await a.press(TOGGLE);
    expect(a.labels()).not.toEqual(labels);
  });
});

describe('нейтральность — один код экранов на двух каналах', () => {
  /** Сценарий `finishTasks` на беседе: создать задачу, открыть карточку, выполнить. */
  const onDialog = async () => {
    const w = worldOf('dialog');
    const a = w.person(A);
    await a.enter('start');
    await a.say(TITLE);
    await a.press('Открыть задачу');
    await a.press(TITLE);
    await a.press('Выполнить');
    await a.settle();
    return w;
  };

  /** Тот же сценарий на странице. */
  const onPages = async () => {
    const w = worldOf('pages');
    const tab = await w.tab(A);
    await tab.client.route('/');
    await tab.client.submit('main', 'create', { title: TITLE });
    await tab.client.submit('main', 'open', { taskId: TITLE });
    await tab.client.submit('side', 'complete', {});
    await w.bus.delivered();
    await tab.wire.settled();
    return w;
  };

  /** Проекция записей исходов: то, что обязано совпасть у каналов. */
  const outcomes = (observer: MemoryUiObserver) =>
    observer.records.flatMap((r) =>
      r.kind === 'outcome'
        ? [{ node: r.node, outcome: r.outcome, to: r.to, exit: r.exit }]
        : [],
    );

  /** Файлы каталога привязки, которые принадлежат только примеру. */
  const exampleOnly = (dir: string) =>
    readdirSync(join(import.meta.dir, '..', dir)).filter((name) =>
      /\.(code|screen|story)\.ts$/.test(name),
    );

  test('сторис finishTasks: записи исходов наблюдателя двух каналов равны', async () => {
    const dialog = await onDialog();
    const pages = await onPages();
    const expected = outcomes(dialog.observer);
    expect(expected.length).toBeGreaterThan(0);
    expect(outcomes(pages.observer)).toEqual(expected);
  });

  test('сторис finishTasks: итоговое состояние задачи на двух каналах одно', async () => {
    const dialog = await onDialog();
    const pages = await onPages();
    const expected = [{ title: TITLE, status: 'done' as const }];
    expect(await dialog.tasksOf()).toEqual(expected);
    expect(await pages.tasksOf()).toEqual(expected);
  });

  test('приложения каналов делят сторис и набор', () => {
    expect(ExamplePagesAppDef.stories).toHaveLength(
      ExampleDialogAppDef.stories.length,
    );
    expect(
      ExamplePagesAppDef.stories.every(
        (story, index) => story === ExampleDialogAppDef.stories[index],
      ),
    ).toBe(true);
    expect(ExamplePagesAppDef.set).toBe(ExampleDialogAppDef.set);
  });

  test('в привязках каналов нет кода, экранов и сторис примера', () => {
    expect(exampleOnly('packages/chat-ui/testing/example')).toEqual([]);
    expect(exampleOnly('packages/web-ui/testing/example')).toEqual([]);
  });

  test('беседа, порт выхода: принятый выход при непустом пути сбрасывает путь', async () => {
    const taken: ConversationExit[] = [];
    const w = worldOf('dialog-exit-port', {
      exits: (exit) => {
        taken.push(exit);
        return true;
      },
    });
    const a = w.person(A);
    await w.assignToA();
    await a.enter('assigned');
    await a.press(CARD);

    await a.press('Закрыть');
    await a.settled();

    const saved = v.parse(Saved, await w.store.load('peer-a'));
    expect(taken).toHaveLength(1);
    expect(taken[0]?.screen).toBe(USER_CARD);
    expect(saved).toEqual({});
    expect(a.hasLive()).toBe(false);
  });
});

const OutcomeRecord = v.object({
  op: v.string(),
  caller: v.object({ kind: v.string() }),
  result: v.object({ ok: v.boolean() }),
});

/**
 * Результаты `getUser` от человека из лога операций мира: `ok` по порядку;
 * вызовы резолвера вызывающего (`system`) не считаются.
 */
function getUserResults(world: AcceptanceWorld): boolean[] {
  return oplogRecords(world.dataDir)
    .map((record) => v.parse(OutcomeRecord, record))
    .filter(
      (record) => record.op === 'getUser' && record.caller.kind === 'user',
    )
    .map((record) => record.result.ok);
}

describe('подписи вариантов на живых экранах беседы — одноимённых нет', () => {
  /** Подписи без пометки «🚫» повторов не дают: «🚫 Назад» и «Назад» — одно слово для человека. */
  const expectDistinct = (labels: readonly string[]) => {
    const names = labels.map(bare);
    expect(names.filter((name, i) => names.indexOf(name) !== i)).toEqual([]);
  };

  test('меню', async () => {
    const w = worldOf('labels-menu');
    const a = w.person(A);
    await a.enter('menu');

    expectDistinct(a.labels());
  });

  test('список при пустом пути (вход start), пустой и со страницами', async () => {
    const w = worldOf('labels-list-root');
    const a = w.person(A);
    await a.enter('start');
    expectDistinct(a.labels());
    for (const title of [TITLE, SECOND, 'Сыр']) await w.createTask(A, title);
    await a.enter('start');
    expectDistinct(a.labels());
    await a.press('Дальше');
    expectDistinct(a.labels());
  });

  test('список при непустом пути (меню → «Мои задачи»): листание и «Назад» различимы', async () => {
    const w = worldOf('labels-list-path');
    const a = w.person(A);
    await a.enter('menu');
    await a.press('Мои задачи');
    expect(a.labels()).toContain(BACK);
    expectDistinct(a.labels());

    for (const title of [TITLE, SECOND, 'Сыр']) await a.say(title);
    await a.settle();
    expectDistinct(a.labels());
    await a.press('Дальше');
    expectDistinct(a.labels());
  });

  test('карточка задачи, «Назначенные мне» и карточка исполнителя', async () => {
    const w = worldOf('labels-cards');
    const a = w.person(A);
    await a.enter('menu');
    await a.press('Мои задачи');
    await a.say(TITLE);
    await a.press('Открыть задачу');
    await a.press(TITLE);
    expectDistinct(a.labels());

    await w.assignToA(SECOND);
    await a.enter('menu');
    await a.press('Назначенные мне');
    expectDistinct(a.labels());
    await a.press(CARD);
    expectDistinct(a.labels());
  });
});

describe('состав приёмки', () => {
  const ROOT = import.meta.dir;
  /** Определения ядра, которых в приёмке быть не должно: экраны, сторис и наборы — только в примере. */
  const DEFINES = /\b(ScreenDef|StoryDef|UiAppDef|UiSetDef)\.define\b/;
  const CODE_BASE = /extends\s+ScreenCode\b/;
  const LIAR = 'support/liar-assigned.code.ts';

  const sources = (): { path: string; text: string }[] =>
    readdirSync(ROOT, { recursive: true, encoding: 'utf8' })
      .filter((path) => path.endsWith('.ts'))
      .map((path) => ({
        path: path.split('\\').join('/'),
        text: readFileSync(join(ROOT, path), 'utf8'),
      }));

  test('в приёмке нет определений экранов, сторис, приложений и наборов', () => {
    const found = sources()
      .filter((file) => DEFINES.test(file.text))
      .map((file) => file.path);

    expect(found).toEqual([]);
  });

  test('единственная подмена кода экрана в приёмке — support/liar-assigned.code.ts', () => {
    const found = sources()
      .filter((file) => CODE_BASE.test(file.text))
      .map((file) => file.path);

    expect(found).toEqual([LIAR]);
  });
});
