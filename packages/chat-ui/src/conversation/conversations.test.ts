import { describe, expect, test } from 'bun:test';
import { Trace, UseCaseDef } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  CompleteTaskUcDef,
  CreateTaskUcDef,
  ExampleApp,
  type ExampleUser,
} from 'dmg-core/testing/example';
import { type AnyUiAppDef, UiAppDef } from 'dmg-ui';
import {
  ApiAppDispatch,
  type PersonPlaces,
  type UcDispatch,
  type UcRequest,
  UiServer,
} from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
  TaskCardScreenDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { oplogRecords, T0 } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import {
  ExampleDialogAppDef,
  exampleDialogViews,
  MemoryMessenger,
  type MessengerEntry,
} from '../../testing';
import { PlainText } from '../message/plain-text';
import type { OptionLimits } from '../messenger/messenger.types';
import { MAX_PERSON_LENGTH } from './conversation.const';
import type {
  ConversationSignal,
  ConversationSnapshot,
  ConversationsSpec,
} from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';
import type { ConversationStore } from './conversation-store.types';
import { Conversations } from './conversations';
import { MemoryConversationStore } from './memory-conversation-store';

// Узел бесед одного приложения мессенджера: личность отправителя, снимок в
// хранилище и восстановление после перезапуска, пределы сигналов и бесед в
// памяти, лог без данных собеседника. Мир — учебное приложение во временном
// каталоге за сервером UI; «перезапуск» — новый узел и новый подставной
// мессенджер на том же хранилище и том же сервере.

const A = testUuid(1);
const B = testUuid(2);
const WHO_A = { peer: 'peer-a', sender: 'sender-a' } as const;
const WHO_B = { peer: 'peer-b', sender: 'sender-b' } as const;
const tmp = useTempDir('dmg-ui-conversations-');

type Who = { readonly peer: string; readonly sender: string };

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

/** Бэкенд вызова с задержкой одного UC по имени — до `release` теста. */
class GatedDispatch implements UcDispatch<ExampleUser> {
  private gate:
    | { readonly uc: string; readonly reached: () => void; open: Promise<void> }
    | undefined;

  constructor(private readonly inner: UcDispatch<ExampleUser>) {}

  /** Следующий вызов `uc` ждёт `release`; `reached` — вызов дошёл до бэкенда. */
  hold(uc: string) {
    const reached = Promise.withResolvers<void>();
    const open = Promise.withResolvers<void>();
    this.gate = { uc, reached: reached.resolve, open: open.promise };
    return { reached: reached.promise, release: open.resolve };
  }

  async dispatch(request: UcRequest<ExampleUser>) {
    const gate = this.gate;
    if (gate !== undefined && gate.uc === request.uc.name) {
      this.gate = undefined;
      gate.reached();
      await gate.open;
    }
    return this.inner.dispatch(request);
  }
}

/** Приложение примера со входом на карточку задачи `taskId`. */
const cardApp = (taskId: string): AnyUiAppDef =>
  UiAppDef.define({
    name: 'exampleDialogCard',
    label: 'Пример с карточкой',
    description: 'Учебное приложение со входом на карточку задачи.',
    set: ExampleUiSetDef,
    channel: ExampleDialogAppDef.channel,
    stories: [],
    entries: {
      start: {
        label: 'Мои задачи',
        description: 'Список своих задач с начала.',
        address: TaskListScreenDef.at({ page: 0 }),
      },
      card: {
        label: 'Задача',
        description: 'Карточка задачи.',
        address: TaskCardScreenDef.at({ taskId }),
      },
    },
  });

type NodeOptions = {
  readonly app?: AnyUiAppDef;
  readonly messenger?: MemoryMessenger;
  readonly store?: ConversationStore;
  readonly limit?: number;
  readonly home?: string;
  readonly people?: (sender: string) => Promise<string | undefined>;
  readonly places?: PersonPlaces;
  readonly callers?: ConversationsSpec<ExampleUser>['callers'];
  readonly epochs?: () => string;
};

const world = () => {
  const bus = new AwaitingBus();
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { bus, logger: new MemoryLogger(), clock: () => T0 },
  );
  const gate = new GatedDispatch(new ApiAppDispatch(example.api));
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: gate,
    context: { bus, logger: new MemoryLogger() },
  });
  const store = new MemoryConversationStore();
  const people = new Map<string, string>([
    [WHO_A.sender, A],
    [WHO_B.sender, B],
  ]);
  // Эпохи ссылок — одна последовательность на мир: каждое воплощение любой
  // беседы любого узла берёт следующую, как случайные.
  let epoch = 0;
  const epochs = () => {
    epoch += 1;
    return `e${String(epoch).padStart(4, '0')}`;
  };

  /** Узел бесед; новый узел на том же хранилище — «перезапуск». */
  const node = (options: NodeOptions = {}) => {
    const messenger = options.messenger ?? MemoryMessenger.editing();
    const logger = new MemoryLogger();
    const conversations = new Conversations({
      app: options.app ?? ExampleDialogAppDef,
      codes: exampleCodes(),
      server,
      views: exampleDialogViews,
      observer: new MemoryUiObserver(),
      messenger,
      store: options.store ?? store,
      logger,
      people: options.people ?? (async (sender: string) => people.get(sender)),
      callers: options.callers ?? example.callers,
      places: options.places ?? places,
      ...(options.home === undefined ? {} : { home: options.home }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      epochs: options.epochs ?? epochs,
    });
    return { conversations, messenger, logger };
  };

  // У каждого запроса мимо беседы свой requestId: повтор платформа отсеивает.
  let requests = 0;
  /** Вызывающий `uuid` и след запроса мимо беседы: события идут по шине. */
  const outside = async (uuid: string) => {
    requests += 1;
    const trace = Trace.fromRequest({ requestId: `r-api-${requests}` });
    const caller = await example.callers.resolve(uuid, trace);
    if (!caller.ok) throw new Error('вызывающий не найден');
    return { caller: caller.value, trace };
  };

  const create = async (title: string, uuid = A): Promise<string> => {
    const { caller, trace } = await outside(uuid);
    const result = await example.api.dispatchByName(
      'todo',
      UseCaseDef.commandOf(CreateTaskUcDef, { title }),
      caller,
      trace,
    );
    if (!result.ok) throw new Error('createTask не исполнен');
    return v.parse(v.object({ taskId: v.string() }), result.value).taskId;
  };

  const complete = async (taskId: string): Promise<void> => {
    const { caller, trace } = await outside(A);
    const result = await example.api.dispatchByName(
      'todo',
      UseCaseDef.commandOf(CompleteTaskUcDef, { taskId }),
      caller,
      trace,
    );
    if (!result.ok) throw new Error('completeTask не исполнен');
  };

  let ids = 0;
  const head = (who: Who, id?: string) => {
    ids += 1;
    return { id: id ?? `sig-${ids}`, peer: who.peer, sender: who.sender };
  };
  const signals = {
    enter: (entry: string, who: Who = WHO_A): ConversationSignal => ({
      ...head(who),
      kind: 'enter',
      entry,
    }),
    press: (
      ref: string,
      press: string,
      who: Who = WHO_A,
    ): ConversationSignal => ({ ...head(who), kind: 'press', ref, press }),
    text: (text: string, who: Who = WHO_A): ConversationSignal => ({
      ...head(who),
      kind: 'text',
      text,
    }),
    cancel: (who: Who = WHO_A): ConversationSignal => ({
      ...head(who),
      kind: 'cancel',
    }),
  };

  return { bus, gate, store, example, people, node, create, complete, signals };
};

type Sent = Extract<MessengerEntry, { op: 'sent' }>;

const sent = (messenger: MemoryMessenger, peer: string = WHO_A.peer): Sent[] =>
  messenger.journal.filter(
    (entry): entry is Sent => entry.op === 'sent' && entry.peer === peer,
  );

/** Видимое содержимое: новое сообщение или правка на месте. */
type Shown = Extract<MessengerEntry, { op: 'sent' | 'edited' }>;

/** Показы собеседника по порядку: новые сообщения и правки на месте. */
const visible = (
  messenger: MemoryMessenger,
  peer: string = WHO_A.peer,
): Shown[] =>
  messenger.journal.filter(
    (entry): entry is Shown =>
      (entry.op === 'sent' || entry.op === 'edited') && entry.peer === peer,
  );

const text = (entry: Shown) => PlainText.of(entry.message.text);

/** Текст последнего показа: нового сообщения или правки на месте. */
const lastText = (
  messenger: MemoryMessenger,
  peer: string = WHO_A.peer,
): string => {
  const entry = visible(messenger, peer).at(-1);
  if (entry === undefined) throw new Error('сообщений нет');
  return text(entry);
};

/** Ссылка варианта `label` из самого свежего показа, где он есть. */
const refOf = (messenger: MemoryMessenger, label: string): string => {
  for (const entry of [...visible(messenger)].reverse()) {
    const option = entry.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

const refsOf = (messenger: MemoryMessenger, peer: string = WHO_A.peer) =>
  sent(messenger, peer).flatMap((entry) =>
    entry.message.options.map((o) => o.ref),
  );

const answered = (messenger: MemoryMessenger) =>
  messenger.journal.flatMap((entry) =>
    entry.op === 'answered' ? [entry.press] : [],
  );

const snapshotOf = async (
  store: ConversationStore,
  peer: string = WHO_A.peer,
): Promise<ConversationSnapshot> =>
  v.parse(ConversationSnapshotSchema, await store.load(peer));

const Instance = v.object({
  address: v.unknown(),
  state: v.unknown(),
  revision: v.number(),
});

const Record = v.object({
  op: v.string(),
  result: v.object({ ok: v.boolean() }),
});

const records = (op: string) =>
  oplogRecords(tmp().path)
    .map((r) => v.parse(Record, r))
    .filter((r) => r.op === op);

/** Мир с задачей «Хлеб» и приложением со входом на её карточку. */
const breadWorld = async () => {
  const w = world();
  const bread = await w.create('Хлеб');
  await w.bus.delivered();
  return { ...w, bread, app: cardApp(bread) };
};

describe('Conversations — сохранить, перезапуск, восстановить', () => {
  test('круг «сохранить — перезапуск — восстановить»: тот же экран и состояние', async () => {
    const w = world();
    await w.create('Хлеб');
    await w.create('Молоко');
    await w.create('Сыр');
    await w.bus.delivered();
    const first = w.node();
    await first.conversations.receive(w.signals.enter('start'));
    await first.conversations.receive(
      w.signals.press(refOf(first.messenger, 'Дальше'), 'p-next'),
    );
    const before = lastText(first.messenger);
    const saved = await snapshotOf(w.store);
    await first.conversations.close();

    const second = w.node();
    await second.conversations.receive(w.signals.cancel());

    expect(before).toContain('Сыр');
    expect(before).not.toContain('Хлеб');
    expect(sent(second.messenger).map(text)).toEqual([before]);
    const was = v.parse(Instance, saved.screen?.instance);
    const now = v.parse(Instance, (await snapshotOf(w.store)).screen?.instance);
    expect(now).toEqual({
      address: was.address,
      state: was.state,
      revision: was.revision + 1,
    });
    expect(saved.person).toBe(A);
  });

  test('после перезапуска нажатие на прежнем экране, вид не изменился, — действие исполнено сразу', async () => {
    const w = await breadWorld();
    const first = w.node({ app: w.app });
    await first.conversations.receive(w.signals.enter('card'));
    const done = refOf(first.messenger, 'Выполнить');
    await first.conversations.close();

    const second = w.node({ app: w.app });
    await second.conversations.receive(w.signals.press(done, 'p-done'));
    await w.bus.delivered();
    await second.conversations.settled();

    expect(records('completeTask')).toMatchObject([{ result: { ok: true } }]);
    const texts = sent(second.messenger).map(text);
    expect(texts[0]).toContain('Статус: выполнена');
    expect(texts.some((t) => t.includes('Экран обновился'))).toBe(false);
    expect(answered(second.messenger)).toEqual(['p-done']);
  });

  test('после перезапуска вид изменился — экран обновлён с пометкой «Экран обновился», UC не вызван', async () => {
    const w = await breadWorld();
    const first = w.node({ app: w.app });
    await first.conversations.receive(w.signals.enter('card'));
    const done = refOf(first.messenger, 'Выполнить');
    await first.conversations.close();
    await w.complete(w.bread);
    await w.bus.delivered();

    const second = w.node({ app: w.app });
    await second.conversations.receive(w.signals.press(done, 'p-done'));

    // Единственный completeTask — тот, что мимо беседы.
    expect(records('completeTask')).toHaveLength(1);
    const [shown] = sent(second.messenger).map(text);
    expect(shown).toStartWith('Экран обновился.');
    expect(shown).toContain('Статус: выполнена');
    expect(answered(second.messenger)).toEqual(['p-done']);
  });

  test('ссылки после перезапуска не совпадают ни с одной выданной до него', async () => {
    const w = world();
    await w.create('Хлеб');
    await w.bus.delivered();
    const first = w.node();
    await first.conversations.receive(w.signals.enter('start'));
    await first.conversations.receive(w.signals.cancel());
    const before = refsOf(first.messenger);
    await first.conversations.close();

    const second = w.node();
    await second.conversations.receive(w.signals.cancel());
    await second.conversations.receive(w.signals.enter('start'));
    const after = refsOf(second.messenger);

    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    expect(after.filter((ref) => before.includes(ref))).toEqual([]);
    for (const ref of after) expect(ref).toMatch(/^[a-z0-9]{1,16}$/);
  });

  test('повтор сигнала после перезапуска отсеян — id в снимке', async () => {
    const w = await breadWorld();
    const first = w.node({ app: w.app });
    await first.conversations.receive(w.signals.enter('card'));
    const done = w.signals.press(refOf(first.messenger, 'Выполнить'), 'p-1');
    await first.conversations.receive(done);
    await w.bus.delivered();
    await first.conversations.settled();
    await first.conversations.close();

    const second = w.node({ app: w.app });
    await second.conversations.receive(done);

    expect(records('completeTask')).toHaveLength(1);
    expect(second.messenger.journal).toEqual([]);
  });

  test('мусор в хранилище — новая беседа, warn без данных, без броска', async () => {
    const w = world();
    w.store.put(WHO_A.peer, { version: 2, person: A, refs: 'мусор' });
    const node = w.node();

    await node.conversations.receive(w.signals.enter('start'));

    expect(lastText(node.messenger)).toContain('Мои задачи');
    expect(node.logger.records).toEqual([
      {
        level: 'warn',
        source: 'chat-ui',
        message: expect.any(String),
        meta: { messenger: 'memory-editing' },
      },
    ]);
    expect((await snapshotOf(w.store)).person).toBe(A);
  });

  test('экран снимка не восстановлен — заметка и вход start; нажатие прежней ссылки не исполнено', async () => {
    const w = await breadWorld();
    const first = w.node({ app: w.app });
    await first.conversations.receive(w.signals.enter('card'));
    const done = refOf(first.messenger, 'Выполнить');
    await first.conversations.close();
    const saved = await snapshotOf(w.store);
    if (saved.screen === undefined) throw new Error('в снимке нет экрана');
    w.store.put(WHO_A.peer, {
      ...saved,
      screen: {
        ...saved.screen,
        instance: {
          address: { screen: 'x/y/z', params: {} },
          state: null,
          revision: 1,
        },
      },
    });

    const second = w.node({ app: w.app });
    await second.conversations.receive(w.signals.press(done, 'p-done'));

    const texts = sent(second.messenger).map(text);
    expect(texts[0]).toBe('Прежний экран не восстановлен — начнём сначала.');
    expect(texts[1]).toContain('Мои задачи');
    expect(texts).toHaveLength(2);
    expect(records('completeTask')).toEqual([]);
    expect(answered(second.messenger)).toEqual(['p-done']);
  });
});

describe('Conversations — личность отправителя', () => {
  test('отправитель без личности — сигнал не исполнен, на нажатие ответ, warn без данных', async () => {
    const w = world();
    const node = w.node();
    const stranger = { peer: 'peer-x', sender: 'sender-x' };

    await node.conversations.receive(
      w.signals.press('e00011', 'p-x', stranger),
    );

    expect(node.messenger.journal).toEqual([
      { op: 'answered', peer: 'peer-x', press: 'p-x' },
    ]);
    expect(node.logger.records).toMatchObject([
      {
        level: 'warn',
        source: 'chat-ui',
        meta: { messenger: 'memory-editing', kind: 'press' },
      },
    ]);
    expect(await w.store.load('peer-x')).toBeUndefined();
  });

  test('личность сигнала не владелец беседы — сигнал не исполнен, снимок не тронут', async () => {
    const w = world();
    const node = w.node();
    await node.conversations.receive(w.signals.enter('start'));
    const before = JSON.stringify(await w.store.load(WHO_A.peer));
    const journal = node.messenger.journal.length;

    await node.conversations.receive(
      w.signals.press(refOf(node.messenger, 'Закрыть'), 'p-b', {
        peer: WHO_A.peer,
        sender: WHO_B.sender,
      }),
    );

    expect(node.messenger.journal.slice(journal)).toEqual([
      { op: 'answered', peer: WHO_A.peer, press: 'p-b' },
    ]);
    expect(JSON.stringify(await w.store.load(WHO_A.peer))).toBe(before);
    expect(node.logger.records).toMatchObject([
      {
        level: 'warn',
        source: 'chat-ui',
        meta: { messenger: 'memory-editing', kind: 'press' },
      },
    ]);
  });

  test('после перезапуска сигнал чужой личности — не исполнен, снимок прежний', async () => {
    const w = world();
    const first = w.node();
    await first.conversations.receive(w.signals.enter('start'));
    const close = refOf(first.messenger, 'Закрыть');
    await first.conversations.close();
    const before = JSON.stringify(await w.store.load(WHO_A.peer));

    const second = w.node();
    await second.conversations.receive(
      w.signals.press(close, 'p-b', {
        peer: WHO_A.peer,
        sender: WHO_B.sender,
      }),
    );

    expect(second.messenger.journal).toEqual([
      { op: 'answered', peer: WHO_A.peer, press: 'p-b' },
    ]);
    expect(JSON.stringify(await w.store.load(WHO_A.peer))).toBe(before);
    expect(second.logger.records).toMatchObject([
      {
        level: 'warn',
        source: 'chat-ui',
        meta: { messenger: 'memory-editing', kind: 'press' },
      },
    ]);
  });

  test('бросок порта people — error без данных, на нажатие ответ, беседы нет', async () => {
    const w = world();
    const node = w.node({
      people: async () => {
        throw new Error('people-mark-q7');
      },
    });

    await node.conversations.receive(w.signals.press('e00011', 'p-x'));

    expect(node.messenger.journal).toEqual([
      { op: 'answered', peer: WHO_A.peer, press: 'p-x' },
    ]);
    expect(node.logger.records).toEqual([
      {
        level: 'error',
        source: 'chat-ui',
        message: expect.any(String),
        meta: { messenger: 'memory-editing', kind: 'press', name: 'Error' },
      },
    ]);
    expect(await w.store.load(WHO_A.peer)).toBeUndefined();
  });
});

describe('Conversations — пределы', () => {
  test('id сигнала длиннее 256 — отвергнут без броска, на нажатие ответ; ровно 256 — принят', async () => {
    const w = world();
    const node = w.node();
    await node.conversations.receive(w.signals.enter('start'));
    const journal = node.messenger.journal.length;
    const close = refOf(node.messenger, 'Закрыть');

    await node.conversations.receive({
      ...w.signals.press(close, 'p-long'),
      id: 'i'.repeat(257),
    });
    const rejected = node.messenger.journal.slice(journal);
    await node.conversations.receive({
      ...w.signals.enter('start'),
      id: 'i'.repeat(256),
    });

    expect(rejected).toEqual([
      { op: 'answered', peer: WHO_A.peer, press: 'p-long' },
    ]);
    expect(node.logger.records).toEqual([
      {
        level: 'warn',
        source: 'chat-ui',
        message: expect.any(String),
        meta: {
          messenger: 'memory-editing',
          kind: 'press',
          reason: 'signalId',
        },
      },
    ]);
    // Вход сбивает положение: прежнее место уходит, экран — новым сообщением.
    expect(node.messenger.journal.slice(journal).map((e) => e.op)).toEqual([
      'answered',
      'retired',
      'sent',
    ]);
    expect(lastText(node.messenger)).toContain('Мои задачи');
  });

  test('текст длиннее 65 536 символов — отвергнут без броска; ровно 65 536 — принят', async () => {
    const w = world();
    const node = w.node();

    await node.conversations.receive(w.signals.text('a'.repeat(65_537)));
    const rejected = [...node.messenger.journal];
    await node.conversations.receive(w.signals.text('a'.repeat(65_536)));

    expect(rejected).toEqual([]);
    expect(node.logger.records).toEqual([
      {
        level: 'warn',
        source: 'chat-ui',
        message: expect.any(String),
        meta: { messenger: 'memory-editing', kind: 'text', reason: 'text' },
      },
    ]);
    // Принятый текст без живого экрана открывает вход home.
    expect(lastText(node.messenger)).toContain('Мои задачи');
  });

  test('предел бесед в памяти: давняя выгружена, её следующий сигнал поднимает её из хранилища', async () => {
    const w = world();
    const node = w.node({ limit: 2 });
    const peers = ['peer-1', 'peer-2', 'peer-3'];
    for (const peer of peers) {
      await node.conversations.receive(
        w.signals.enter('start', { peer, sender: WHO_A.sender }),
      );
    }
    const epochOf = (peer: string) =>
      refsOf(node.messenger, peer)[0]?.slice(0, 5);
    const firstEpoch = epochOf('peer-1');

    await w.create('Молоко');
    await w.bus.delivered();
    await node.conversations.settled();
    const counts = peers.map((peer) => visible(node.messenger, peer).length);
    const before = refsOf(node.messenger, 'peer-1').length;
    await node.conversations.receive(
      w.signals.cancel({ peer: 'peer-1', sender: WHO_A.sender }),
    );

    // Выгруженная беседа подписок не держит: проактивного показа у неё нет.
    expect(counts).toEqual([1, 2, 2]);
    expect(lastText(node.messenger, 'peer-1')).toContain('Молоко');
    const restored = refsOf(node.messenger, 'peer-1').slice(before);
    expect(restored.length).toBeGreaterThan(0);
    for (const ref of restored)
      expect(ref.startsWith(firstEpoch ?? '')).toBe(false);
  });
});

describe('Conversations — независимость, лог и settled', () => {
  test('беседы разных собеседников не ждут друг друга', async () => {
    const w = await breadWorld();
    const node = w.node({ app: w.app });
    await node.conversations.receive(w.signals.enter('card'));
    const held = w.gate.hold('completeTask');

    const pressed = node.conversations.receive(
      w.signals.press(refOf(node.messenger, 'Выполнить'), 'p-a'),
    );
    await held.reached;
    await node.conversations.receive(w.signals.enter('start', WHO_B));
    const whileHeld = answered(node.messenger);
    held.release();
    await pressed;
    await w.bus.delivered();
    await node.conversations.settled();

    expect(lastText(node.messenger, WHO_B.peer)).toContain('Мои задачи');
    expect(whileHeld).toEqual([]);
    expect(answered(node.messenger)).toEqual(['p-a']);
  });

  test('в лог не идут данные собеседника', async () => {
    const w = world();
    const who = { peer: 'peer-mark-q7', sender: 'sender-mark-q7' };
    w.people.set(who.sender, A);
    w.store.put(who.peer, { version: 1, person: 'garbage-mark-q7' });
    const node = w.node();

    await node.conversations.receive({
      ...w.signals.enter('start', who),
      id: 'id-mark-q7-1',
    });
    node.messenger.failNext('unavailable');
    await node.conversations.receive({
      ...w.signals.text('text-mark-q7', who),
      id: 'id-mark-q7-2',
    });
    await node.conversations.receive({
      ...w.signals.press('zzzzz1', 'press-mark-q7-1', who),
      id: `id-mark-q7-${'x'.repeat(300)}`,
    });
    await node.conversations.receive({
      id: 'id-mark-q7-3',
      peer: who.peer,
      sender: who.sender,
      kind: 'attachment',
      attachment: { kind: 'file', handle: 'handle-mark-q7' },
    });
    await node.conversations.receive({
      ...w.signals.press('refmarkq7', 'press-mark-q7-2', who),
      id: 'id-mark-q7-4',
    });

    const metas = node.logger.records.map((record) => record.meta);
    expect(metas).toEqual(
      expect.arrayContaining([
        { messenger: 'memory-editing' },
        // Текст сбивает положение: первой уходит `retire` прежнего места.
        {
          messenger: 'memory-editing',
          operation: 'retire',
          reason: 'unavailable',
        },
        { messenger: 'memory-editing', kind: 'press', reason: 'signalId' },
      ]),
    );
    const log = JSON.stringify(node.logger.records);
    const shown = sent(node.messenger, who.peer).flatMap((entry) =>
      entry.message.options.flatMap((o) => [o.ref, o.label]),
    );
    expect(shown.length).toBeGreaterThan(0);
    for (const mark of ['mark-q7', 'refmarkq7', A, ...shown]) {
      expect(log).not.toContain(mark);
    }
  });

  test('settled дожидается проактивного показа без таймеров', async () => {
    const w = world();
    const node = w.node();
    await node.conversations.receive(w.signals.enter('start'));

    await w.create('Молоко');
    await w.bus.delivered();
    await node.conversations.settled();

    expect(visible(node.messenger)).toHaveLength(2);
    expect(lastText(node.messenger)).toContain('Молоко');
  });

  test('перечитывание по событию, перезапуск без close — нажатие на перечитанном виде исполняется', async () => {
    const w = world();
    const first = w.node();
    await first.conversations.receive(w.signals.enter('start'));
    await w.create('Молоко');
    await w.bus.delivered();
    await first.conversations.settled();
    const refreshed = lastText(first.messenger);
    const create = refOf(first.messenger, 'Создать задачу');

    const second = w.node();
    await second.conversations.receive(w.signals.press(create, 'p-create'));

    expect(visible(first.messenger)).toHaveLength(2);
    expect(refreshed).toContain('Молоко');
    const texts = sent(second.messenger).map(text);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('Название задачи');
    expect(answered(second.messenger)).toEqual(['p-create']);
  });
});

describe('Conversations — хранилище и сборка', () => {
  test('сбой записи хранилища — error без данных, беседа работает дальше в памяти', async () => {
    const w = world();
    const failing: ConversationStore = {
      load: async () => undefined,
      save: async () => {
        throw new Error('save-mark-q7');
      },
    };
    const node = w.node({ store: failing });

    await node.conversations.receive(w.signals.enter('start'));
    await node.conversations.receive(w.signals.cancel());

    expect(sent(node.messenger).map(text)).toHaveLength(2);
    expect(lastText(node.messenger)).toContain('Мои задачи');
    const errors = node.logger.records.filter((r) => r.level === 'error');
    expect(errors.length).toBeGreaterThan(0);
    for (const record of errors) {
      expect(record).toMatchObject({
        source: 'chat-ui',
        meta: { messenger: 'memory-editing', operation: 'save' },
      });
    }
    const log = JSON.stringify(node.logger.records);
    expect(log).not.toContain('mark-q7');
    expect(log).not.toContain(WHO_A.peer);
  });

  test('снимок сверх предела схемы не пишется — error без данных, прежний снимок в хранилище цел, беседа работает в памяти', async () => {
    const w = world();
    // Личность длиннее предела схемы (64): беседа её не режет, снимок выходит
    // за схему; вызывающего для неё подставляет тест. В хранилище — прежняя запись.
    const long = `mark-q7-${'x'.repeat(MAX_PERSON_LENGTH)}`;
    const before = { version: 1, person: long, serial: 0, refs: [], seen: [] };
    w.store.put(WHO_A.peer, before);
    const node = w.node({
      people: async () => long,
      callers: {
        resolve: (_uuid, trace) => w.example.callers.resolve(A, trace),
      },
    });

    await node.conversations.receive(w.signals.enter('start'));
    await node.conversations.receive(w.signals.cancel());
    await node.conversations.close();

    const errors = node.logger.records.filter((r) => r.level === 'error');
    expect(errors.length).toBeGreaterThan(0);
    for (const record of errors) {
      expect(record).toMatchObject({
        source: 'chat-ui',
        meta: {
          messenger: 'memory-editing',
          operation: 'save',
          reason: 'schema',
        },
      });
    }
    expect(await w.store.load(WHO_A.peer)).toEqual(before);
    expect(sent(node.messenger).length).toBeGreaterThan(1);
    const log = JSON.stringify(node.logger.records);
    expect(log).not.toContain('mark-q7');
    expect(log).not.toContain('xxxxxxxx');
    expect(log).not.toContain(WHO_A.peer);
    expect(log).not.toContain(A);
  });

  test('сбой чтения хранилища — сигнал не исполнен, прежний снимок не перезаписан, следующий сигнал после починки поднимает прежнюю беседу', async () => {
    const w = await breadWorld();
    const first = w.node({ app: w.app });
    await first.conversations.receive(w.signals.enter('card'));
    const done = refOf(first.messenger, 'Выполнить');
    await first.conversations.close();
    const before = JSON.stringify(await w.store.load(WHO_A.peer));
    let broken = true;
    const flaky: ConversationStore = {
      load: async (peer) => {
        if (broken) throw new Error('load-mark-q7');
        return w.store.load(peer);
      },
      save: (peer, snapshot) => w.store.save(peer, snapshot),
    };
    const second = w.node({ app: w.app, store: flaky });

    await second.conversations.receive(w.signals.press(done, 'p-1'));
    const failed = sent(second.messenger);
    const after = JSON.stringify(await w.store.load(WHO_A.peer));
    const errors = [...second.logger.records];
    broken = false;
    await second.conversations.receive(w.signals.press(done, 'p-2'));
    await w.bus.delivered();
    await second.conversations.settled();

    expect(failed.map((entry) => `${entry.via}: ${text(entry)}`)).toEqual([
      'show: Сейчас не получилось. Попробуйте позже.',
    ]);
    expect(failed[0]?.message.options).toEqual([]);
    expect(after).toBe(before);
    expect(errors).toEqual([
      {
        level: 'error',
        source: 'chat-ui',
        message: expect.any(String),
        meta: expect.objectContaining({
          messenger: 'memory-editing',
          operation: 'load',
        }),
      },
    ]);
    expect(records('completeTask')).toMatchObject([{ result: { ok: true } }]);
    expect(lastText(second.messenger)).toContain('Статус: выполнена');
    expect(answered(second.messenger)).toEqual(['p-1', 'p-2']);
    const log = JSON.stringify(second.logger.records);
    expect(log).not.toContain('mark-q7');
    expect(log).not.toContain(WHO_A.peer);
  });

  test('бросок сборки беседы — error без данных, на нажатие ответ; следующий сигнал собирает беседу', async () => {
    const w = world();
    let broken = true;
    const node = w.node({
      epochs: () => {
        if (!broken) return 'e9999';
        broken = false;
        throw new Error('build-mark-q7');
      },
    });

    await node.conversations.receive(w.signals.press('e00011', 'p-x'));
    const failed = [...node.messenger.journal];
    await node.conversations.receive(w.signals.enter('start'));

    expect(failed).toEqual([
      { op: 'answered', peer: WHO_A.peer, press: 'p-x' },
    ]);
    expect(node.logger.records).toEqual([
      {
        level: 'error',
        source: 'chat-ui',
        message: expect.any(String),
        meta: { messenger: 'memory-editing', kind: 'press', name: 'Error' },
      },
    ]);
    expect(lastText(node.messenger)).toContain('Мои задачи');
  });

  test('бросок порта мест при пробуждении — экран и черновик снимка не потеряны, следующий сигнал пробует снова', async () => {
    const w = world();
    const first = w.node();
    await first.conversations.receive(w.signals.enter('start'));
    await first.conversations.receive(
      w.signals.press(refOf(first.messenger, 'Создать задачу'), 'p-create'),
    );
    await first.conversations.close();
    const saved = await snapshotOf(w.store);
    let broken = true;
    const second = w.node({
      places: {
        place: async (uuid, trace) => {
          if (broken) throw new Error('place-mark-q7');
          return places.place(uuid, trace);
        },
      },
    });

    await second.conversations.receive(w.signals.text('Молоко'));
    const kept = await snapshotOf(w.store);
    broken = false;
    await second.conversations.receive(w.signals.text('Молоко'));
    await w.bus.delivered();
    await second.conversations.settled();

    expect(saved.screen).toBeDefined();
    expect(saved.draft).toBeDefined();
    expect(kept.screen).toEqual(saved.screen);
    expect(kept.draft).toEqual(saved.draft);
    expect(second.logger.records).toEqual([
      {
        level: 'error',
        source: 'chat-ui',
        message: expect.any(String),
        meta: { messenger: 'memory-editing', kind: 'text', name: 'Error' },
      },
    ]);
    expect(records('createTask')).toMatchObject([{ result: { ok: true } }]);
  });

  test('дефект беседы — снимок всё равно записан: повтор сигнала после перезапуска без close отсеян', async () => {
    const w = world();
    const first = w.node({
      places: {
        place: async () => {
          throw new Error('place-mark-q7');
        },
      },
    });
    const enter = w.signals.enter('start');
    await first.conversations.receive(enter);

    const second = w.node();
    await second.conversations.receive(enter);

    expect(first.logger.records).toMatchObject([
      {
        level: 'error',
        meta: { messenger: 'memory-editing', kind: 'enter', name: 'Error' },
      },
    ]);
    expect((await snapshotOf(w.store)).seen).toEqual([enter.id]);
    expect(second.messenger.journal).toEqual([]);
  });

  test('сборка: нет входа home или возможности не годятся — бросок', () => {
    const w = world();
    const editing = MemoryMessenger.editing().capabilities;
    const withOptions = (options: Partial<OptionLimits>) =>
      new MemoryMessenger({
        capabilities: {
          ...editing,
          options: { ...editing.options, ...options },
        },
      });

    expect(() => w.node({ home: 'nowhere' })).toThrow();
    expect(() => w.node({ messenger: withOptions({ max: 2 }) })).toThrow();
    expect(() => w.node({ messenger: withOptions({ ref: 15 }) })).toThrow();
    expect(() => w.node()).not.toThrow();
  });
});
