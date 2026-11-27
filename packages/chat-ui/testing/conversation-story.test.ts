import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import {
  type ConversationSignal,
  ConversationSnapshotSchema,
  Conversations,
  MemoryConversationStore,
  type Message,
  PlainText,
} from 'dmg-ui/chat-ui';
import {
  ExampleDialogUiAppDef,
  ExampleUiSetDef,
  exampleCodes,
  exampleDialogViews,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/example';
import {
  ApiAppDispatch,
  type PersonPlaces,
  UiNotifier,
  UiServer,
} from 'dmg-ui/server';
import { MemoryUiObserver } from 'dmg-ui/testing';
import { oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger, type MessengerEntry } from './index';

// Сквозной тест сторис на беседе (TST-09 — единственный; бывший
// `ui-two-users.test.ts`): пользователи A и B, учебное приложение во
// временном каталоге, сервер UI, узел бесед на подставном мессенджере и
// уведомитель, чья доставка — сам узел бесед: уведомление приходит в чат
// получателя. Одна сторис — на
// обоих подставных мессенджерах с одними представлениями и кодом экранов.

const A = testUuid(1);
const B = testUuid(2);
const LIST = 'exampleUi/todo/taskList';
const CARD = 'exampleUi/todo/taskCard';
const ASSIGNED = 'exampleUi/todo/assignedTasks';
const MORE = 'Ещё';
const tmp = useTempDir('dmg-ui-conversation-story-');

type Who = { readonly peer: string; readonly sender: string };

const WHO_A: Who = { peer: 'peer-a', sender: 'sender-a' };
const WHO_B: Who = { peer: 'peer-b', sender: 'sender-b' };

const MESSENGERS = [
  ['editing', () => MemoryMessenger.editing()],
  ['windowed', () => MemoryMessenger.windowed(() => T0)],
] as const;

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

/** Снимок экземпляра ядра живого экрана беседы. */
const Instance = v.object({
  address: v.object({ screen: v.string(), params: v.unknown() }),
  state: v.optional(v.unknown()),
  revision: v.number(),
});

/** Видимое содержимое: новое сообщение или правка на месте. */
type Shown = Extract<MessengerEntry, { op: 'sent' | 'edited' }>;

const textOf = (message: Message) => PlainText.of(message.text);

const labelsOf = (message: Message) => message.options.map((o) => o.label);

/** Приложение, сервер, узел бесед и уведомитель с записывающей доставкой. */
const world = (messenger: MemoryMessenger) => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const codes = exampleCodes({}, ExampleDialogUiAppDef);
  const observer = new MemoryUiObserver();
  const store = new MemoryConversationStore();
  const people = new Map([
    [WHO_A.sender, A],
    [WHO_B.sender, B],
  ]);
  const peerOf = new Map([
    [A, WHO_A.peer],
    [B, WHO_B.peer],
  ]);
  // Id запросов следа по порядку выдачи: номер запроса сигнала — последний
  // выданный после его обработки (один след на сигнал).
  const requests: string[] = [];
  const conversations = new Conversations({
    app: ExampleDialogUiAppDef,
    codes,
    server,
    views: exampleDialogViews(ExampleDialogUiAppDef),
    observer,
    messenger,
    store,
    logger: context.logger,
    people: async (sender) => people.get(sender),
    peers: async (uuid) => peerOf.get(uuid),
    callers: example.callers,
    places,
    requestIds: () => {
      const id = `r-${requests.length + 1}`;
      requests.push(id);
      return id;
    },
  });
  new UiNotifier({
    app: ExampleDialogUiAppDef,
    codes,
    dispatch,
    callers: example.callers,
    delivery: conversations,
    observer,
    context,
  }).start();

  let signals = 0;
  let turns = 0;
  const head = (who: Who) => {
    signals += 1;
    return { id: `s-${signals}`, peer: who.peer, sender: who.sender };
  };

  /** Сигнал обработан и снимок записан; возвращает id запроса его следа. */
  const receive = async (signal: ConversationSignal): Promise<string> => {
    await conversations.receive(signal);
    const request = requests.at(-1);
    if (request === undefined) throw new Error('сигнал без следа');
    return request;
  };

  /** Показы собеседника по порядку: новые сообщения и правки на месте. */
  const shown = (who: Who): Shown[] =>
    messenger.journal.filter(
      (entry): entry is Shown =>
        (entry.op === 'sent' || entry.op === 'edited') &&
        entry.peer === who.peer,
    );

  const journal = (who: Who) =>
    messenger.journal.filter(
      (entry) => entry.op !== 'community' && entry.peer === who.peer,
    );

  /** Уведомления, дошедшие до собеседника: записи журнала `notify`. */
  const notices = (who: Who): Message[] =>
    messenger.journal.flatMap((entry) =>
      entry.op === 'sent' && entry.via === 'notify' && entry.peer === who.peer
        ? [entry.message]
        : [],
    );

  /** Показы экрана без уведомлений: порядок «показ / уведомление» не закреплён. */
  const screens = (who: Who): Shown[] =>
    shown(who).filter((s) => !(s.op === 'sent' && s.via === 'notify'));

  /** Живое место глазами собеседника — последнее неушедшее сообщение с вариантами. */
  const place = (who: Who): Message => {
    const line = [...messenger.chat(who.peer)]
      .reverse()
      .find((l) => !l.retired && l.message.options.length > 0);
    if (line === undefined) throw new Error('живого места нет');
    return line.message;
  };

  const pressRef = (who: Who, ref: string) => {
    const at = head(who);
    return receive({ ...at, kind: 'press', ref, press: `p-${at.id}` });
  };

  /** «Ещё» живого места — следующая страница вариантов. */
  const turn = async (who: Who): Promise<void> => {
    const more = place(who).options.find((o) => o.label === MORE);
    if (more === undefined) throw new Error('листать некуда');
    turns += 1;
    await pressRef(who, more.ref);
  };

  /** Ссылка варианта `label` живого места; варианты по страницам — листая «Ещё». */
  const reveal = async (who: Who, label: string): Promise<string> => {
    for (let page = 0; page < 8; page += 1) {
      const option = place(who).options.find((o) => o.label === label);
      if (option !== undefined) return option.ref;
      if (!labelsOf(place(who)).includes(MORE)) break;
      await turn(who);
    }
    throw new Error(`нет варианта «${label}» в живом месте`);
  };

  /** Подписи всех страниц живого места: «Ещё» по кругу до первой страницы. */
  const everyLabel = async (who: Who): Promise<string[]> => {
    const first = labelsOf(place(who));
    const seen = new Set(first);
    if (!first.includes(MORE)) return [...seen];
    for (let page = 0; page < 8; page += 1) {
      await turn(who);
      const labels = labelsOf(place(who));
      if (labels.join('\n') === first.join('\n')) {
        seen.delete(MORE);
        return [...seen];
      }
      for (const label of labels) seen.add(label);
    }
    throw new Error('страницы живого места не замкнулись');
  };

  /** Реакция на нажатие: текст ответа у мессенджера с ответом, иначе заметка. */
  const reaction = (who: Who): string => {
    if (messenger.capabilities.pressAnswer !== undefined) {
      const last = journal(who).at(-1);
      if (last?.op !== 'answered' || last.text === undefined)
        throw new Error('реакции текстом ответа нет');
      return last.text;
    }
    const line = messenger.chat(who.peer).at(-1);
    if (line === undefined) throw new Error('сообщений нет');
    return textOf(line.message);
  };

  /** Живой экран беседы из снимка в хранилище. */
  const screen = async (who: Who) => {
    const raw = await store.load(who.peer);
    const snapshot = v.parse(ConversationSnapshotSchema, raw);
    return v.parse(Instance, snapshot.screen?.instance);
  };

  const person = (who: Who) => ({
    enter: (entry: string) => receive({ ...head(who), kind: 'enter', entry }),
    say: (text: string) => receive({ ...head(who), kind: 'text', text }),
    press: async (label: string) => pressRef(who, await reveal(who, label)),
    pressRef: (ref: string) => pressRef(who, ref),
    reveal: (label: string) => reveal(who, label),
    everyLabel: () => everyLabel(who),
    place: () => place(who),
    shown: () => shown(who),
    screens: () => screens(who),
    notices: () => notices(who),
    journal: () => journal(who),
    chat: () => messenger.chat(who.peer),
    reaction: () => reaction(who),
    screen: () => screen(who),
  });

  /** Шина доставила, беседы отработали проактивные показы и записали снимки. */
  const settle = async () => {
    await bus.delivered();
    await conversations.settled();
  };

  return {
    a: person(WHO_A),
    b: person(WHO_B),
    settle,
    turns: () => turns,
  };
};

const Record = v.object({
  op: v.string(),
  caller: v.object({
    kind: v.string(),
    subjectId: v.optional(v.string()),
  }),
  trace: v.object({
    cause: v.object({ kind: v.string() }),
    correlationId: v.string(),
  }),
  result: v.object({ ok: v.boolean() }),
  events: v.array(v.object({ name: v.string() })),
});

/** Записи лога операций с операцией `op`. */
const records = (op: string) =>
  oplogRecords(tmp().path)
    .map((r) => v.parse(Record, r))
    .filter((r) => r.op === op);

describe.each(MESSENGERS)('сторис на беседе (%s)', (name, make) => {
  const editing = name === 'editing';

  test('сторис на беседе: задачи A, поручение B, перечитывание и уведомления от имени B', async () => {
    const w = world(make());
    const { a, b } = w;

    // 0. B открывает свой список «Мои задачи» — пусто.
    const startOfB = await b.enter('start');
    const listOfB = await b.screen();
    expect(listOfB.address).toEqual({ screen: LIST, params: { page: 0 } });
    expect(b.chat()).toHaveLength(1);
    const journalOfB = b.journal().length;

    // 2. A: «Мои задачи»; свободный текст — основное действие `create`, выход
    // `created`, затем снова вход `start`.
    await a.enter('start');
    await a.say('Хлеб');
    await w.settle();
    expect(
      a.shown().some((s) => textOf(s.message).includes('Задача создана')),
    ).toBe(true);
    expect((await a.screen()).address).toEqual({
      screen: LIST,
      params: { page: 0 },
    });

    // Событие `created` субъекта A список B не перечитывает: ревизия прежняя,
    // беседа B не тронута (две личности).
    expect((await b.screen()).revision).toBe(listOfB.revision);
    expect(b.journal()).toHaveLength(journalOfB);

    // 1. B открывает «Назначенные мне» — пусто; список B закрыт.
    const assignedOfB = await b.enter('assigned');
    expect((await b.screen()).address).toEqual({
      screen: ASSIGNED,
      params: {},
    });
    expect(b.chat()).toHaveLength(2);

    // 3. Ещё две задачи: на странице две, есть «Дальше».
    await a.say('Молоко');
    await a.say('Сыр');
    await w.settle();
    expect(await a.everyLabel()).toContain('Дальше');

    // 4. «Дальше» — вторая страница; старая ссылка — экран уже закрыт.
    const next = await a.reveal('Дальше');
    await a.pressRef(next);
    expect((await a.screen()).address).toEqual({
      screen: LIST,
      params: { page: 1 },
    });
    expect(textOf(a.place())).toContain('Сыр');
    await a.pressRef(next);
    expect(a.reaction()).toContain('Эта кнопка устарела');

    // 5. Листание назад — первая страница.
    await a.press(TaskListScreenDef.actions.prev.label);
    expect((await a.screen()).address).toEqual({
      screen: LIST,
      params: { page: 0 },
    });

    // 6. Локальное действие: выбор двух задач вариантами поля.
    await a.press('Отметить задачу');
    await a.press('Хлеб');
    await a.press('Отметить задачу');
    await a.press('Молоко');
    expect((await a.screen()).state).toEqual({
      selected: [expect.any(String), expect.any(String)],
    });

    // 7. «Выполнить выбранные» — подтверждение, «Да» — `completeTasks`.
    await a.press('Выполнить выбранные');
    expect(labelsOf(a.place())).toEqual(expect.arrayContaining(['Да', 'Нет']));
    await a.press('Да');
    await w.settle();
    expect(records('completeTasks')).toMatchObject([
      { result: { ok: true }, events: [{}, {}] },
    ]);
    const afterAll = await a.everyLabel();
    expect(afterAll).not.toContain('Выполнить выбранные');
    expect(afterAll).toContain('🚫 Выполнить выбранные');

    // 8. Карточка «Сыр»; «Назначить» — текстовый ввод исполнителя B.
    await a.press('Сыр');
    expect((await a.screen()).address.screen).toBe(CARD);
    await a.press('Назначить');
    await a.say(B);
    await w.settle();

    // 9. У B — проактивный показ живого экрана и уведомление в чате; карточку
    // A событие назначения не перечитало. Показов экрана три: список,
    // «Назначенные мне», проактивный; форма (правка или новое сообщение) и
    // порядок относительно уведомления не закрепляются — проверяется набор
    // видимого.
    const screensB = b.screens();
    expect(screensB).toHaveLength(3);
    const proactive = screensB.at(-1);
    if (proactive === undefined) throw new Error('показов экрана нет');
    expect(textOf(proactive.message)).toContain('Сыр');
    const [assigned, ...restB] = b.notices();
    if (assigned === undefined) throw new Error('уведомления в чате B нет');
    expect(restB).toEqual([]);
    expect(textOf(assigned)).toBe(`${TaskAssignedNotificationDef.label}: Сыр`);
    expect(labelsOf(assigned)).toEqual(['Назначенные мне']);
    expect(
      b.chat().some((line) => textOf(line.message).includes('Вам назначена')),
    ).toBe(true);
    expect((await a.screen()).revision).toBe(2);

    // 10. A выполняет задачу на карточке: действие стало недоступным, B
    // получил «Поручение выполнено» (получатель — из `getTaskAssignee`).
    await a.press('Выполнить');
    await w.settle();
    const afterDone = await a.everyLabel();
    expect(afterDone).not.toContain('Выполнить');
    expect(afterDone).toContain('🚫 Выполнить');
    expect(b.notices().map((n) => textOf(n))).toEqual([
      `${TaskAssignedNotificationDef.label}: Сыр`,
      `${TaskCompletedNotificationDef.label}: Сыр`,
    ]);
    expect(b.notices().map(labelsOf)).toEqual([
      ['Назначенные мне'],
      ['Назначенные мне'],
    ]);

    // Лог операций: B читает от своего имени по событию с цепочкой запроса A;
    // A перечитывает свой список по своему событию;
    // получатель — запрос системы; `listTasks` B звал только запросом открытия
    // своего списка (шаг 0), по событию A — ни разу.
    const [assign] = records('assignTask');
    expect(assign?.trace.correlationId).toMatch(/^r-/);
    const readsB = records('listAssignedTasks')
      .filter((r) => r.caller.subjectId === B)
      .map((r) => `${r.trace.cause.kind}:${r.trace.correlationId}`);
    const [complete] = records('completeTask');
    // Ровно: открытие «Назначенных мне» (запрос сигнала входа B), перечитывание
    // по назначению и чтение уведомления «назначена» — цепочка назначения A,
    // чтение уведомления «выполнено» — цепочка выполнения A.
    expect(readsB.toSorted()).toEqual(
      [
        `request:${assignedOfB}`,
        `event:${assign?.trace.correlationId}`,
        `event:${assign?.trace.correlationId}`,
        `event:${complete?.trace.correlationId}`,
      ].toSorted(),
    );
    // Свой экран перечитан своим событием: список A — по выполнению выбранных.
    const [completeMany] = records('completeTasks');
    expect(
      records('listTasks')
        .filter((r) => r.caller.subjectId === A)
        .map((r) => `${r.trace.cause.kind}:${r.trace.correlationId}`),
    ).toContain(`event:${completeMany?.trace.correlationId}`);
    const assignee = records('getTaskAssignee');
    expect(assignee.length).toBeGreaterThan(0);
    expect(assignee.every((r) => r.caller.kind === 'system')).toBe(true);
    expect(
      records('listTasks')
        .filter((r) => r.caller.subjectId === B)
        .map((r) => `${r.trace.cause.kind}:${r.trace.correlationId}`),
    ).toEqual([`request:${startOfB}`]);

    // Ревизии и уведомления: события A экран B не перечитывали (кроме
    // назначения), у A уведомлений нет, у B — ровно два.
    expect((await b.screen()).revision).toBe(2);
    expect(a.notices()).toEqual([]);
    expect(b.notices()).toHaveLength(2);
    // «Ещё» листается только у мессенджера с тремя вариантами.
    if (editing) expect(w.turns()).toBe(0);
    else expect(w.turns()).toBeGreaterThan(0);
  });
});
