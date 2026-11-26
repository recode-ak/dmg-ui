import { describe, expect, test } from 'bun:test';
import { Trace, UseCaseDef } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { CreateTaskUcDef, ExampleApp } from 'dmg-core/testing/example';
import type { AddressJson } from 'dmg-ui';
import {
  ASSIGNED_ID,
  ExampleDialogUiAppDef,
  ExampleUiSetDef,
  exampleCodes,
  exampleDialogViews,
  LIST_ID,
  LIST_START,
} from 'dmg-ui/example';
import { ApiAppDispatch, type PersonPlaces, UiServer } from 'dmg-ui/server';
import { MemoryUiObserver } from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { PlainText } from '../message/plain-text';
import { Conversation } from './conversation';
import { CONVERSATION_TEXTS, MAX_SIGNAL_TEXT } from './conversation.const';
import type {
  ConversationSignal,
  ConversationSnapshot,
  LinkStore,
} from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';
import { Conversations } from './conversations';
import { LinkCodes } from './link-codes';
import { MemoryConversationStore } from './memory-conversation-store';
import { MemoryLinkStore } from './memory-link-store';

// Ссылка на экран в беседе (D-UI-127): `/link` выдаёт короткий код
// адреса живого экрана и URL от проекта; сигнал `enter` с `param` открывает
// экран по коду от имени открывшего; сигнал `open` — вход по адресу от
// проекта (мост). Отказы — заметка «Ссылка не найдена.» и сам вход сигнала,
// без броска (ERR-01); лог без кода, адреса и параметров (ERR-07). Мир —
// учебное приложение за сервером UI: два человека видят свои задачи.

const A = testUuid(1);
const B = testUuid(2);
const WHO_A = { peer: 'peer-a', sender: 'sender-a' } as const;
/** Тот же человек A с другого устройства: другая беседа. */
const WHO_A2 = { peer: 'peer-a2', sender: 'sender-a2' } as const;
const WHO_B = { peer: 'peer-b', sender: 'sender-b' } as const;
const STRANGER = { peer: 'peer-x', sender: 'sender-x' } as const;

const BASE = 'https://t.me/example_link_bot?start=';
const urlOf = (code: string): string => `${BASE}${code}`;
const codeOf = (url: string): string => {
  expect(url.startsWith(BASE)).toBe(true);
  return url.slice(BASE.length);
};

const MENU_ID = 'exampleUi/todo/mainMenu';
/** Формат кода, которого в хранилище нет. */
const MISSING_CODE = 'Z'.repeat(22);

const tmp = useTempDir('dmg-ui-conversation-links-');

type Who = { readonly peer: string; readonly sender: string };

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

/** Хранилище ссылок с журналом обращений и управляемыми сбоями. */
class SpyLinkStore implements LinkStore {
  readonly inner = new MemoryLinkStore();
  readonly gets: string[] = [];
  readonly puts: string[] = [];
  failGet: Error | undefined;
  failPut: Error | undefined;

  async get(code: string): Promise<AddressJson | undefined> {
    this.gets.push(code);
    if (this.failGet !== undefined) throw this.failGet;
    return this.inner.get(code);
  }

  async put(code: string, address: AddressJson): Promise<void> {
    this.puts.push(code);
    if (this.failPut !== undefined) throw this.failPut;
    await this.inner.put(code, address);
  }
}

type NodeOptions = {
  /** Без `links` узел ведёт себя как до ссылок. */
  readonly links?: boolean;
  /** Приёмник выходов принимает выход: после него живого экрана нет. */
  readonly exits?: boolean;
  readonly people?: (sender: string) => Promise<string | undefined>;
  /** URL кода проекта; по умолчанию — `urlOf`. */
  readonly url?: (code: string) => string;
};

const world = () => {
  const bus = new AwaitingBus();
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { bus, logger: new MemoryLogger(), clock: () => T0 },
  );
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: new ApiAppDispatch(example.api),
    context: { bus, logger: new MemoryLogger() },
  });
  const store = new MemoryConversationStore();
  const links = new SpyLinkStore();
  const people = new Map<string, string>([
    [WHO_A.sender, A],
    [WHO_A2.sender, A],
    [WHO_B.sender, B],
  ]);
  const peers = new Map<string, string>([
    [A, WHO_A.peer],
    [B, WHO_B.peer],
  ]);
  let epoch = 0;

  /** Узел бесед одного мессенджера; все узлы мира делят хранилища. */
  const node = (options: NodeOptions = {}) => {
    const messenger = MemoryMessenger.editing();
    const logger = new MemoryLogger();
    const conversations = new Conversations({
      app: ExampleDialogUiAppDef,
      codes: exampleCodes({}, ExampleDialogUiAppDef),
      server,
      views: exampleDialogViews(ExampleDialogUiAppDef),
      observer: new MemoryUiObserver(),
      messenger,
      store,
      logger,
      people: options.people ?? (async (sender) => people.get(sender)),
      peers: async (person) => peers.get(person),
      callers: example.callers,
      places,
      epochs: () => {
        epoch += 1;
        return `e${String(epoch).padStart(4, '0')}`;
      },
      ...(options.exits === true
        ? { exits: { accept: async () => true } }
        : {}),
      ...(options.links === false
        ? {}
        : { links: { store: links, url: options.url ?? urlOf } }),
    });
    return { conversations, messenger, logger };
  };

  let requests = 0;
  const create = async (title: string, uuid: string): Promise<void> => {
    requests += 1;
    const trace = Trace.fromRequest({ requestId: `r-links-${requests}` });
    const caller = await example.callers.resolve(uuid, trace);
    if (!caller.ok) throw new Error('вызывающий не найден');
    const result = await example.api.dispatchByName(
      'todo',
      UseCaseDef.commandOf(CreateTaskUcDef, { title }),
      caller.value,
      trace,
    );
    if (!result.ok) throw new Error('createTask не исполнен');
    await bus.delivered();
  };

  let ids = 0;
  const head = (who: Who, id?: string) => {
    ids += 1;
    return { id: id ?? `sig-${ids}`, peer: who.peer, sender: who.sender };
  };
  const signals = {
    enter: (
      entry: string,
      who: Who,
      param?: string,
      id?: string,
    ): ConversationSignal => ({
      ...head(who, id),
      kind: 'enter',
      entry,
      ...(param === undefined ? {} : { param }),
    }),
    link: (who: Who, id?: string): ConversationSignal => ({
      ...head(who, id),
      kind: 'link',
    }),
    open: (
      address: AddressJson,
      who: Who,
      id?: string,
    ): ConversationSignal => ({ ...head(who, id), kind: 'open', address }),
    press: (ref: string, who: Who): ConversationSignal => {
      const at = head(who);
      return { ...at, kind: 'press', ref, press: `p-${at.id}` };
    },
  };

  return { bus, store, links, node, create, signals };
};

type Node = ReturnType<ReturnType<typeof world>['node']>;

const texts = (n: Node, who: Who): string[] =>
  n.messenger.chat(who.peer).map((line) => PlainText.of(line.message.text));

const lastText = (n: Node, who: Who): string => {
  const last = texts(n, who).at(-1);
  if (last === undefined) throw new Error('сообщений нет');
  return last;
};

const refOf = (n: Node, who: Who, label: string): string => {
  for (const line of [...n.messenger.chat(who.peer)].reverse()) {
    const option = line.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

const optionLabels = (n: Node, who: Who): string[] =>
  n.messenger
    .chat(who.peer)
    .at(-1)
    ?.message.options.map((o) => o.label) ?? [];

const snapshotOf = async (
  w: ReturnType<typeof world>,
  who: Who,
): Promise<ConversationSnapshot> =>
  v.parse(ConversationSnapshotSchema, await w.store.load(who.peer));

const InstanceAddress = v.object({
  address: v.object({ screen: v.string(), params: v.unknown() }),
});

/** Id живого экрана беседы по снимку; нет экрана — `undefined`. */
const screenIdOf = async (
  w: ReturnType<typeof world>,
  who: Who,
): Promise<string | undefined> => {
  const { screen } = await snapshotOf(w, who);
  return screen === undefined
    ? undefined
    : v.parse(InstanceAddress, screen.instance).address.screen;
};

/** Снимок без отсева повторов и «последнести» места: их заметка меняет по замыслу. */
const stable = (snapshot: ConversationSnapshot) => ({
  ...snapshot,
  seen: [],
  screen:
    snapshot.screen === undefined
      ? undefined
      : { ...snapshot.screen, latest: undefined },
});

/** Записи лога, чей текст или поля называют `kind` (вид записи — `link-issued` и т.п.). */
const logged = (n: Node, kind: string) =>
  n.logger.records.filter((record) => JSON.stringify(record).includes(kind));

const dump = (n: Node): string => JSON.stringify(n.logger.records);

/** A выдаёт ссылку на экран `entry` с узла: код и URL. */
const issued = async (
  w: ReturnType<typeof world>,
  n: Node,
  who: Who,
  entry = 'start',
) => {
  await n.conversations.receive(w.signals.enter(entry, who));
  await n.conversations.receive(w.signals.link(who));
  const line = lastText(n, who)
    .split('\n')
    .find((one) => one.includes(BASE));
  if (line === undefined) throw new Error('в заметке нет URL');
  const url = line.slice(line.indexOf(BASE)).trim();
  return { url, code: codeOf(url) };
};

describe('Ссылки — тексты', () => {
  test('тексты заметок: заданные решением дословно, ссылка — непустой текст', () => {
    expect(CONVERSATION_TEXTS.linkNotFound).toBe('Ссылка не найдена.');
    expect(CONVERSATION_TEXTS.noLinkScreen).toBe(
      'Здесь нет экрана для ссылки.',
    );
    expect(CONVERSATION_TEXTS.noLinks).toBe('Ссылки здесь не выдаются.');
    expect(CONVERSATION_TEXTS.linkFailed).toBe('Ссылку выдать не удалось.');
    expect(CONVERSATION_TEXTS.link.length).toBeGreaterThan(0);
  });
});

describe('Ссылки — /link: выдача', () => {
  test('живой экран: одна заметка без вариантов — текст ссылки и URL строкой; в хранилище адрес экрана под кодом из LinkCodes', async () => {
    const w = world();
    const a = w.node();
    await a.conversations.receive(w.signals.enter('start', WHO_A));
    const before = texts(a, WHO_A).length;

    await a.conversations.receive(w.signals.link(WHO_A));

    expect(texts(a, WHO_A)).toHaveLength(before + 1);
    const lines = lastText(a, WHO_A).split('\n');
    expect(lines[0]).toContain(CONVERSATION_TEXTS.link);
    const url = lines.find((line) => line.startsWith(BASE));
    if (url === undefined) throw new Error('в заметке нет URL');
    const code = codeOf(url);
    expect(LinkCodes.fits(code)).toBe(true);
    expect(code).toBe(await LinkCodes.of(LIST_START));
    expect(a.messenger.chat(WHO_A.peer).at(-1)?.message.options).toEqual([]);
    expect(w.links.puts).toEqual([code]);
    expect(await w.links.inner.get(code)).toStrictEqual(LIST_START);
  });

  test('повтор: тот же URL, одна запись в хранилище', async () => {
    const w = world();
    const a = w.node();
    const first = await issued(w, a, WHO_A);

    await a.conversations.receive(w.signals.link(WHO_A));
    const again = lastText(a, WHO_A)
      .split('\n')
      .find((line) => line.startsWith(BASE));

    expect(again).toBe(first.url);
    expect(w.links.puts).toEqual([first.code]);
  });

  test('код — свойство адреса, не человека: тот же экран у другого человека — тот же URL, запись не дублируется', async () => {
    const w = world();
    const a = w.node();
    const b = w.node();
    const fromA = await issued(w, a, WHO_A);

    const fromB = await issued(w, b, WHO_B);

    expect(fromB.url).toBe(fromA.url);
    expect(w.links.puts).toEqual([fromA.code]);
  });

  test('другой экран — другой код и другая запись', async () => {
    const w = world();
    const a = w.node();
    const list = await issued(w, a, WHO_A, 'start');

    const menu = await issued(w, a, WHO_A, 'menu');

    expect(menu.code).not.toBe(list.code);
    expect(await w.links.inner.get(menu.code)).toStrictEqual({
      screen: MENU_ID,
      params: {},
    });
    expect(w.links.puts).toEqual([list.code, menu.code]);
  });

  test('в ссылку идёт только адрес: путь не входит; страница списка — параметр адреса и входит', async () => {
    const w = world();
    await w.create('Хлеб', A);
    await w.create('Молоко', A);
    await w.create('Сыр', A);
    const a = w.node();
    await a.conversations.receive(w.signals.enter('menu', WHO_A));
    await a.conversations.receive(
      w.signals.press(refOf(a, WHO_A, 'Мои задачи'), WHO_A),
    );
    await a.conversations.receive(
      w.signals.press(refOf(a, WHO_A, 'Дальше'), WHO_A),
    );
    expect((await snapshotOf(w, WHO_A)).path).toBeDefined();

    await a.conversations.receive(w.signals.link(WHO_A));

    const [code] = w.links.puts;
    if (code === undefined) throw new Error('записи нет');
    const stored = await w.links.inner.get(code);
    expect(stored).toStrictEqual({ screen: LIST_ID, params: { page: 1 } });
    expect(JSON.stringify(stored)).not.toContain(MENU_ID);

    const a2 = w.node();
    await a2.conversations.receive(w.signals.enter('start', WHO_A2, code));
    expect(lastText(a2, WHO_A2)).toContain('Сыр');
    expect(lastText(a2, WHO_A2)).not.toContain('Хлеб');
  });

  test('состояние беседы не меняется: снимок до и после равен (кроме отсева повторов и «последнести» места), путь и экземпляр прежние', async () => {
    const w = world();
    const a = w.node();
    await a.conversations.receive(w.signals.enter('menu', WHO_A));
    await a.conversations.receive(
      w.signals.press(refOf(a, WHO_A, 'Мои задачи'), WHO_A),
    );
    const before = await snapshotOf(w, WHO_A);
    expect(before.path).toHaveLength(1);

    await a.conversations.receive(w.signals.link(WHO_A));

    const after = await snapshotOf(w, WHO_A);
    expect(after.version).toBe(1);
    expect(stable(after)).toEqual(stable(before));
    expect(after.seen).toHaveLength(before.seen.length + 1);
  });

  test('черновик ввода жив: ссылка — заметка, следующий текст отвечает на поле', async () => {
    const w = world();
    const a = w.node();
    await a.conversations.receive(w.signals.enter('start', WHO_A));
    await a.conversations.receive(
      w.signals.press(refOf(a, WHO_A, 'Создать задачу'), WHO_A),
    );
    const draft = (await snapshotOf(w, WHO_A)).draft;
    expect(draft).toBeDefined();

    await a.conversations.receive(w.signals.link(WHO_A));

    expect((await snapshotOf(w, WHO_A)).draft).toEqual(draft);
    expect(w.links.puts).toHaveLength(1);
  });

  test('ссылки таблицы живы: кнопка экрана после /link нажимается', async () => {
    const w = world();
    await w.create('Хлеб', A);
    const a = w.node();
    await a.conversations.receive(w.signals.enter('menu', WHO_A));
    const tasks = refOf(a, WHO_A, 'Мои задачи');
    await a.conversations.receive(w.signals.link(WHO_A));

    await a.conversations.receive(w.signals.press(tasks, WHO_A));

    expect(await screenIdOf(w, WHO_A)).toBe(LIST_ID);
    expect(lastText(a, WHO_A)).toContain('Хлеб');
  });

  test('нет живого экрана до первого входа: «Здесь нет экрана для ссылки.», запись не создана', async () => {
    const w = world();
    const a = w.node();

    await a.conversations.receive(w.signals.link(WHO_A));

    expect(texts(a, WHO_A)).toEqual([CONVERSATION_TEXTS.noLinkScreen]);
    expect(w.links.puts).toEqual([]);
    expect(w.links.gets).toEqual([]);
  });

  test('нет живого экрана после выхода сторис: «Здесь нет экрана для ссылки.»', async () => {
    const w = world();
    const a = w.node({ exits: true });
    await a.conversations.receive(w.signals.enter('menu', WHO_A));
    await a.conversations.receive(
      w.signals.press(refOf(a, WHO_A, 'Закрыть'), WHO_A),
    );
    expect(await screenIdOf(w, WHO_A)).toBeUndefined();
    const before = texts(a, WHO_A).length;

    await a.conversations.receive(w.signals.link(WHO_A));

    expect(texts(a, WHO_A)).toHaveLength(before + 1);
    expect(lastText(a, WHO_A)).toBe(CONVERSATION_TEXTS.noLinkScreen);
    expect(w.links.puts).toEqual([]);
  });

  test('узел без links: «Ссылки здесь не выдаются.», экран и снимок прежние', async () => {
    const w = world();
    const a = w.node({ links: false });
    await a.conversations.receive(w.signals.enter('start', WHO_A));
    const before = await snapshotOf(w, WHO_A);

    await a.conversations.receive(w.signals.link(WHO_A));

    expect(lastText(a, WHO_A)).toBe(CONVERSATION_TEXTS.noLinks);
    expect(stable(await snapshotOf(w, WHO_A))).toEqual(stable(before));
    expect(w.links.gets).toEqual([]);
    expect(w.links.puts).toEqual([]);
  });

  test('бросок URL проекта: не бросает наружу, «Ссылку выдать не удалось.», error без кода и текста броска', async () => {
    const w = world();
    const a = w.node({
      url: () => {
        throw new Error('секрет-url');
      },
    });
    await a.conversations.receive(w.signals.enter('start', WHO_A));

    await a.conversations.receive(w.signals.link(WHO_A));

    expect(lastText(a, WHO_A)).toBe(CONVERSATION_TEXTS.linkFailed);
    expect(a.logger.records.some((r) => r.level === 'error')).toBe(true);
    expect(dump(a)).not.toContain('секрет-url');
    expect(dump(a)).not.toContain(await LinkCodes.of(LIST_START));
    expect(logged(a, 'link-issued')).toEqual([]);
  });

  test('коллизия: в хранилище под этим кодом другой адрес — отказ, чужая запись не перезаписана, error без данных', async () => {
    const w = world();
    const other: AddressJson = { screen: 'чужое/экран', params: { k: 'v' } };
    const code = await LinkCodes.of(LIST_START);
    await w.links.inner.put(code, other);
    const a = w.node();
    await a.conversations.receive(w.signals.enter('start', WHO_A));

    await a.conversations.receive(w.signals.link(WHO_A));

    expect(lastText(a, WHO_A)).toBe(CONVERSATION_TEXTS.linkFailed);
    expect(lastText(a, WHO_A)).not.toContain(BASE);
    expect(w.links.puts).toEqual([]);
    expect(await w.links.inner.get(code)).toStrictEqual(other);
    expect(a.logger.records.some((r) => r.level === 'error')).toBe(true);
    const logs = dump(a);
    expect(logs).not.toContain(code);
    expect(logs).not.toContain('чужое/экран');
    expect(logs).not.toContain(LIST_ID);
  });

  test('бросок хранилища при выдаче (get и put): не бросает наружу, «Ссылку выдать не удалось.», error без данных', async () => {
    for (const failing of ['failGet', 'failPut'] as const) {
      const w = world();
      w.links[failing] = new Error('секрет-хранилища');
      const a = w.node();
      await a.conversations.receive(w.signals.enter('start', WHO_A));

      await a.conversations.receive(w.signals.link(WHO_A));

      expect(lastText(a, WHO_A)).toBe(CONVERSATION_TEXTS.linkFailed);
      expect(a.logger.records.some((r) => r.level === 'error')).toBe(true);
      expect(dump(a)).not.toContain('секрет-хранилища');
      expect(dump(a)).not.toContain(await LinkCodes.of(LIST_START));
    }
  });

  test('лог выдачи: info link-issued с мессенджером, без кода, URL, адреса и параметров', async () => {
    const w = world();
    const a = w.node();
    const { code } = await issued(w, a, WHO_A);

    const records = logged(a, 'link-issued');
    expect(records).toHaveLength(1);
    expect(records[0]?.level).toBe('info');
    expect(dump(a)).toContain(a.messenger.capabilities.name);
    for (const secret of [code, BASE, LIST_ID, 'page', WHO_A.peer, A]) {
      expect(dump(a)).not.toContain(secret);
    }
  });
});

describe('Ссылки — вход по коду (enter с param)', () => {
  test('экран открыт по адресу из хранилища, а не по входу сигнала; вид — по данным открывшего: двое видят каждый своё', async () => {
    const w = world();
    await w.create('Хлеб', A);
    await w.create('Молоко', B);
    const a = w.node();
    const b = w.node();
    const { code } = await issued(w, a, WHO_A);

    await b.conversations.receive(w.signals.enter('menu', WHO_B, code));
    await a.conversations.receive(w.signals.enter('menu', WHO_A2, code));

    expect(await screenIdOf(w, WHO_B)).toBe(LIST_ID);
    expect(lastText(b, WHO_B)).toContain('Молоко');
    expect(lastText(b, WHO_B)).not.toContain('Хлеб');
    expect(await screenIdOf(w, WHO_A2)).toBe(LIST_ID);
    expect(lastText(a, WHO_A2)).toContain('Хлеб');
    expect(lastText(a, WHO_A2)).not.toContain('Молоко');
  });

  test('без заметки: первое и единственное сообщение — сам экран', async () => {
    const w = world();
    const a = w.node();
    const b = w.node();
    const { code } = await issued(w, a, WHO_A);

    await b.conversations.receive(w.signals.enter('start', WHO_B, code));

    expect(texts(b, WHO_B)).toHaveLength(1);
    expect(texts(b, WHO_B)[0]).not.toContain(CONVERSATION_TEXTS.linkNotFound);
  });

  test('путь сброшен: открытие кода после переходов — экран кода, «Назад» нет, снимок без path', async () => {
    const w = world();
    const a = w.node();
    const b = w.node();
    const { code } = await issued(w, a, WHO_A);
    await b.conversations.receive(w.signals.enter('menu', WHO_B));
    await b.conversations.receive(
      w.signals.press(refOf(b, WHO_B, 'Назначенные мне'), WHO_B),
    );
    expect((await snapshotOf(w, WHO_B)).path).toHaveLength(1);
    expect(await screenIdOf(w, WHO_B)).toBe(ASSIGNED_ID);

    await b.conversations.receive(w.signals.enter('menu', WHO_B, code));

    expect(await screenIdOf(w, WHO_B)).toBe(LIST_ID);
    expect((await snapshotOf(w, WHO_B)).path).toBeUndefined();
    expect(optionLabels(b, WHO_B)).not.toContain('Назад');
  });

  test('черновик прежнего экрана сброшен: следующий текст не отвечает на старое поле', async () => {
    const w = world();
    const a = w.node();
    const b = w.node();
    const { code } = await issued(w, a, WHO_A);
    await b.conversations.receive(w.signals.enter('start', WHO_B));
    await b.conversations.receive(
      w.signals.press(refOf(b, WHO_B, 'Создать задачу'), WHO_B),
    );
    expect((await snapshotOf(w, WHO_B)).draft).toBeDefined();

    await b.conversations.receive(w.signals.enter('start', WHO_B, code));

    expect((await snapshotOf(w, WHO_B)).draft).toBeUndefined();
  });

  test('лог открытия: info link-opened с мессенджером, без кода, адреса и параметров', async () => {
    const w = world();
    const a = w.node();
    const b = w.node();
    const { code } = await issued(w, a, WHO_A);
    await b.conversations.receive(w.signals.enter('start', WHO_B, code));

    const records = logged(b, 'link-opened');
    expect(records).toHaveLength(1);
    expect(records[0]?.level).toBe('info');
    expect(dump(b)).toContain(b.messenger.capabilities.name);
    for (const secret of [code, LIST_ID, 'page', WHO_B.peer, B]) {
      expect(dump(b)).not.toContain(secret);
    }
  });

  test('узел без links: param игнорируется — вход сигнала, без заметки, хранилище не читалось', async () => {
    const w = world();
    const a = w.node();
    const { code } = await issued(w, a, WHO_A, 'menu');
    const b = w.node({ links: false });
    // Выдача у A уже читала хранилище: узел B к нему не добавляет ни одного чтения.
    const gets = [...w.links.gets];

    await b.conversations.receive(w.signals.enter('start', WHO_B, code));

    expect(await screenIdOf(w, WHO_B)).toBe(LIST_ID);
    expect(texts(b, WHO_B)).toHaveLength(1);
    expect(texts(b, WHO_B)[0]).not.toContain(CONVERSATION_TEXTS.linkNotFound);
    expect(w.links.gets).toEqual(gets);
  });

  test('enter без param — как раньше: вход сигнала, хранилище не читается', async () => {
    const w = world();
    const b = w.node();

    await b.conversations.receive(w.signals.enter('menu', WHO_B));

    expect(await screenIdOf(w, WHO_B)).toBe(MENU_ID);
    expect(w.links.gets).toEqual([]);
  });
});

describe('Ссылки — экран снимка не восстановлен', () => {
  /** B был на меню; экран снимка испорчен — поднять его нельзя. */
  const broken = async (w: ReturnType<typeof world>) => {
    const b = w.node();
    await b.conversations.receive(w.signals.enter('menu', WHO_B));
    const raw = structuredClone(await snapshotOf(w, WHO_B)) as {
      screen?: { instance: unknown };
    };
    if (raw.screen === undefined) throw new Error('экрана в снимке нет');
    raw.screen.instance = {
      address: { screen: 'exampleUi/todo/removed', params: {} },
      state: null,
      revision: 1,
    };
    w.store.put(WHO_B.peer, raw);
  };

  test('enter с кодом исполняется: заметка «не восстановлен», затем экран кода, а не home', async () => {
    const w = world();
    const a = w.node();
    const { code } = await issued(w, a, WHO_A, 'menu');
    await broken(w);
    const b = w.node();

    await b.conversations.receive(w.signals.enter('start', WHO_B, code));

    expect(texts(b, WHO_B)[0]).toBe(CONVERSATION_TEXTS.notRestored);
    expect(await screenIdOf(w, WHO_B)).toBe(MENU_ID);
  });

  test('open исполняется: заметка «не восстановлен», затем экран адреса, а не home', async () => {
    const w = world();
    await broken(w);
    const b = w.node();

    await b.conversations.receive(
      w.signals.open({ screen: MENU_ID, params: {} }, WHO_B),
    );

    expect(texts(b, WHO_B)[0]).toBe(CONVERSATION_TEXTS.notRestored);
    expect(await screenIdOf(w, WHO_B)).toBe(MENU_ID);
  });

  test('link поглощает home: заметка «не восстановлен» и вход home, ссылка не выдана', async () => {
    const w = world();
    await broken(w);
    const b = w.node();

    await b.conversations.receive(w.signals.link(WHO_B));

    expect(texts(b, WHO_B)[0]).toBe(CONVERSATION_TEXTS.notRestored);
    expect(await screenIdOf(w, WHO_B)).toBe(LIST_ID);
    expect(w.links.puts).toEqual([]);
  });
});

describe('Ссылки — вход по коду: отказы', () => {
  test('пустой param — как без параметра: вход сигнала, без заметки, лога отказа и чтения хранилища', async () => {
    const w = world();
    const b = w.node();

    await b.conversations.receive(w.signals.enter('menu', WHO_B, ''));

    expect(texts(b, WHO_B)).toHaveLength(1);
    expect(await screenIdOf(w, WHO_B)).toBe(MENU_ID);
    expect(w.links.gets).toEqual([]);
    expect(logged(b, 'link-rejected')).toEqual([]);
  });

  /** Отказ: заметка «Ссылка не найдена.», затем вход сигнала; без броска. */
  const expectNotFound = async (
    w: ReturnType<typeof world>,
    b: Node,
    reason: string,
    entry = 'start',
  ) => {
    const lines = texts(b, WHO_B);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(CONVERSATION_TEXTS.linkNotFound);
    expect(await screenIdOf(w, WHO_B)).toBe(
      entry === 'start' ? LIST_ID : MENU_ID,
    );
    const rejected = logged(b, 'link-rejected');
    expect(rejected).toHaveLength(1);
    expect(JSON.stringify(rejected[0])).toContain(reason);
  };

  test('кода нет в хранилище: заметка и вход сигнала, порт спрошен ровно этим кодом', async () => {
    const w = world();
    const b = w.node();

    await b.conversations.receive(
      w.signals.enter('start', WHO_B, MISSING_CODE),
    );

    await expectNotFound(w, b, 'unknown');
    expect(w.links.gets).toEqual([MISSING_CODE]);
    expect(dump(b)).not.toContain(MISSING_CODE);
  });

  test('вход сигнала — тот, что в сигнале: на entry menu после отказа — меню', async () => {
    const w = world();
    const b = w.node();

    await b.conversations.receive(w.signals.enter('menu', WHO_B, MISSING_CODE));

    await expectNotFound(w, b, 'unknown', 'menu');
  });

  test.each([
    ['короче 22', 'a'.repeat(21)],
    ['длиннее 22', 'a'.repeat(23)],
    ['с точкой', `${'a'.repeat(21)}.`],
    ['кириллица', 'я'.repeat(22)],
    ['длиннее параметра Bot API', 'a'.repeat(65)],
  ])(
    'param не по формату (%s): заметка и вход сигнала, в хранилище не ходили, в лог не попал',
    async (_, param) => {
      const w = world();
      const b = w.node();

      await b.conversations.receive(w.signals.enter('start', WHO_B, param));

      await expectNotFound(w, b, 'format');
      expect(w.links.gets).toEqual([]);
      expect(dump(b)).not.toContain(param);
    },
  );

  test.each([
    [
      'экран удалён из набора',
      { screen: 'exampleUi/todo/removed', params: {} },
    ],
    ['параметры не по схеме экрана', { screen: LIST_ID, params: { page: -1 } }],
    ['лишние параметры', { screen: LIST_ID, params: { page: 0, extra: 1 } }],
    ['без экрана', {}],
    ['не объект', 'мусор'],
    ['null', null],
  ])(
    'адрес не декодировался (%s): заметка и вход сигнала, без броска, лог без адреса',
    async (_, bad) => {
      const w = world();
      await w.links.inner.put(MISSING_CODE, bad as AddressJson);
      const b = w.node();

      await b.conversations.receive(
        w.signals.enter('start', WHO_B, MISSING_CODE),
      );

      await expectNotFound(w, b, 'address');
      expect(dump(b)).not.toContain(MISSING_CODE);
      expect(dump(b)).not.toContain('removed');
    },
  );

  test('порт бросил: не бросает наружу, заметка и вход сигнала, error без кода и текста броска', async () => {
    const w = world();
    w.links.failGet = new Error(`сбой для ${MISSING_CODE}`);
    const b = w.node();

    await b.conversations.receive(
      w.signals.enter('start', WHO_B, MISSING_CODE),
    );

    await expectNotFound(w, b, 'port');
    expect(b.logger.records.some((r) => r.level === 'error')).toBe(true);
    expect(dump(b)).not.toContain(MISSING_CODE);
    expect(dump(b)).not.toContain('сбой для');
  });

  test('после отказа беседа жива: следующий код открывается', async () => {
    const w = world();
    const a = w.node();
    const b = w.node();
    const { code } = await issued(w, a, WHO_A);
    await b.conversations.receive(w.signals.enter('menu', WHO_B, MISSING_CODE));

    await b.conversations.receive(w.signals.enter('menu', WHO_B, code));

    expect(await screenIdOf(w, WHO_B)).toBe(LIST_ID);
  });
});

describe('Ссылки — сигнал open: вход по адресу от проекта', () => {
  test('экран открыт по адресу, вид по данным открывшего; путь сброшен; без заметки', async () => {
    const w = world();
    await w.create('Хлеб', A);
    await w.create('Молоко', B);
    const b = w.node();
    await b.conversations.receive(w.signals.enter('menu', WHO_B));
    await b.conversations.receive(
      w.signals.press(refOf(b, WHO_B, 'Назначенные мне'), WHO_B),
    );
    expect((await snapshotOf(w, WHO_B)).path).toHaveLength(1);

    await b.conversations.receive(w.signals.open(LIST_START, WHO_B));

    expect(await screenIdOf(w, WHO_B)).toBe(LIST_ID);
    expect((await snapshotOf(w, WHO_B)).path).toBeUndefined();
    expect(lastText(b, WHO_B)).toContain('Молоко');
    expect(lastText(b, WHO_B)).not.toContain('Хлеб');
    expect(texts(b, WHO_B).join('\n')).not.toContain(
      CONVERSATION_TEXTS.linkNotFound,
    );
  });

  test('работает и на узле без links: хранилище не нужно', async () => {
    const w = world();
    const b = w.node({ links: false });

    await b.conversations.receive(w.signals.open(LIST_START, WHO_B));

    expect(await screenIdOf(w, WHO_B)).toBe(LIST_ID);
    expect(w.links.gets).toEqual([]);
  });

  test('повтор сигнала с тем же id отсеян', async () => {
    const w = world();
    const b = w.node();
    await b.conversations.receive(w.signals.open(LIST_START, WHO_B, 'open-1'));
    const before = b.messenger.journal.length;

    await b.conversations.receive(w.signals.open(LIST_START, WHO_B, 'open-1'));

    expect(b.messenger.journal).toHaveLength(before);
  });

  test.each([
    [
      'экран удалён из набора',
      { screen: 'exampleUi/todo/removed', params: {} },
    ],
    ['параметры не по схеме', { screen: LIST_ID, params: { page: 'a' } }],
    ['не адрес', 'мусор'],
  ])(
    'адрес не декодировался (%s): заметка «Ссылка не найдена.» и вход home, без броска',
    async (_, bad) => {
      const w = world();
      const b = w.node();

      await b.conversations.receive(w.signals.open(bad as AddressJson, WHO_B));

      const lines = texts(b, WHO_B);
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(CONVERSATION_TEXTS.linkNotFound);
      expect(await screenIdOf(w, WHO_B)).toBe(LIST_ID);
      expect(dump(b)).not.toContain('removed');
    },
  );

  test('отправитель без личности: сигнал не исполнен, сообщений нет, warn', async () => {
    const w = world();
    const b = w.node();

    await b.conversations.receive(w.signals.open(LIST_START, STRANGER));

    expect(b.messenger.chat(STRANGER.peer)).toEqual([]);
    expect(b.logger.records.some((r) => r.level === 'warn')).toBe(true);
  });
});

describe('Ссылки — пределы сигнала (Conversation.rejects)', () => {
  const head = { id: 's-1', peer: 'peer-a', sender: 'sender-a' };

  test('param enter: ровно MAX_SIGNAL_TEXT — принят, длиннее — «text»', () => {
    const at = (length: number): ConversationSignal => ({
      ...head,
      kind: 'enter',
      entry: 'start',
      param: 'a'.repeat(length),
    });

    expect(Conversation.rejects(at(MAX_SIGNAL_TEXT))).toBeUndefined();
    expect(Conversation.rejects(at(MAX_SIGNAL_TEXT + 1))).toBe('text');
  });

  test('enter без param и с кодом — в пределах', () => {
    expect(
      Conversation.rejects({ ...head, kind: 'enter', entry: 'start' }),
    ).toBeUndefined();
    expect(
      Conversation.rejects({
        ...head,
        kind: 'enter',
        entry: 'start',
        param: MISSING_CODE,
      }),
    ).toBeUndefined();
  });

  test('open: обычный адрес — в пределах; адрес, чей размер больше MAX_SIGNAL_TEXT, — «text»', () => {
    expect(
      Conversation.rejects({ ...head, kind: 'open', address: LIST_START }),
    ).toBeUndefined();
    expect(
      Conversation.rejects({
        ...head,
        kind: 'open',
        address: {
          screen: LIST_ID,
          params: { page: 0, pad: 'x'.repeat(MAX_SIGNAL_TEXT * 2) },
        },
      }),
    ).toBe('text');
  });

  test('узел: сигнал сверх предела отвергнут без броска — ни показа, ни обращения к хранилищу ссылок', async () => {
    const w = world();
    const b = w.node();

    await b.conversations.receive(
      w.signals.enter('start', WHO_B, 'a'.repeat(MAX_SIGNAL_TEXT + 1)),
    );

    expect(b.messenger.chat(WHO_B.peer)).toEqual([]);
    expect(w.links.gets).toEqual([]);
    expect(b.logger.records.some((r) => r.level === 'warn')).toBe(true);
  });
});
