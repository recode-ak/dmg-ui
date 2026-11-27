import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result, Trace } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type Address,
  type AnyScreenDef,
  AppCodeLoaders,
  Availability,
  CodeLoader,
  CodeLoaders,
  type LoadContext,
  type RefreshSignal,
  ScreenCode,
  ScreenDef,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { RuntimeKit, T0, testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogTraces } from '../dialog/dialog-traces';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import { AppChatViews } from '../view/app-chat-views';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import type { ConversationSnapshot, RefEntry } from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';

// Действие строки в беседе (действие строки списка): строки списка — кнопки на
// месте действия; нажатие строки — исполнение со входом `{ itemId: ключ }` без
// черновика и вопроса; у действия с `confirm` — подтверждение, затем
// исполнение; сверх лимита вариантов — страницы с «Ещё»; запись ссылки `row`
// переживает снимок беседы. Беседа — на исполнителе с заглушками и
// локальными Def.

const A = testUuid(1);
const PEER = 'peer-a';
const BOARD = 'rowUi/rows/board';
const ITEM = 'rowUi/rows/item';
const MARKED_KEY = 'rowkey-mark-q7';

type Row = { readonly id: string; readonly title: string };

/** Данные доски: тест меняет их между сигналами, код читает при загрузке и пишет вызовы. */
type World = {
  items: readonly Row[];
  extras: readonly Row[];
  /** `open` отключено с причиной. */
  openOff: boolean;
  readonly calls: string[];
};

const BREAD = { id: 'b1', title: 'Хлеб' };
const MILK = { id: 'm2', title: 'Молоко' };
const CHEESE = { id: 'c3', title: 'Сыр' };

const worldOf = (): World => ({
  items: [BREAD, MILK],
  extras: [CHEESE],
  openOff: false,
  calls: [],
});

const RowShape = v.object({
  id: v.pipe(v.string(), v.description('Ключ строки')),
  title: v.pipe(v.string(), v.description('Подпись строки')),
});

/** Карточка строки: адрес несёт ключ. */
const ItemScreenDef = ScreenDef.define({
  name: 'item',
  label: 'Карточка',
  description: 'Экран ребёнка: карточка строки.',
  params: v.strictObject({
    itemId: v.pipe(v.string(), v.description('Ключ строки')),
  }),
  reads: [],
  data: v.object({
    itemId: v.pipe(v.string(), v.description('Ключ строки')),
  }),
});

/** Доска: действие строки с переходом, обычное действие и действие строки с подтверждением на другом списке. */
const BoardScreenDef = ScreenDef.define({
  name: 'board',
  label: 'Доска',
  description: 'Два списка строк и обычное действие между ними.',
  reads: [],
  data: v.object({
    items: v.array(RowShape),
    extras: v.array(RowShape),
  }),
  actions: {
    open: {
      label: 'Открыть',
      description: 'Строка списка — на карточку.',
      input: v.object({ itemId: v.pipe(v.string(), v.description('Строка')) }),
      row: { list: 'items', key: 'id', label: 'title' },
      to: (): readonly AnyScreenDef[] => [ItemScreenDef],
    },
    stay: { label: 'Обновить', description: 'Остаётся на экране.' },
    drop: {
      label: 'Удалить',
      description: 'Строка второго списка — с подтверждением.',
      input: v.object({ itemId: v.pipe(v.string(), v.description('Строка')) }),
      row: { list: 'extras', key: 'id', label: 'title' },
      confirm: { label: 'Удалить строку?', description: 'Вернуть нельзя.' },
    },
  },
});

type Board = typeof BoardScreenDef;
type Item = typeof ItemScreenDef;

class BoardCode extends ScreenCode<Board> {
  override readonly actions: Partial<ActionSteps<Board>> = {
    open: { done: ({ input }) => ItemScreenDef.at({ itemId: input.itemId }) },
    stay: { done: () => BoardScreenDef.at({}) },
    drop: {
      done: ({ input }) => {
        this.world.calls.push(`drop:${input.itemId}`);
        return BoardScreenDef.at({});
      },
    },
  };

  override readonly availability = {
    open: () =>
      this.world.openOff
        ? Availability.disabled('Список закрыт')
        : Availability.yes(),
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<
    Result<v.InferOutput<Board['data']>, DomainError>
  > {
    return ok({ items: [...this.world.items], extras: [...this.world.extras] });
  }
}

class ItemCode extends ScreenCode<Item> {
  override async load({
    params,
  }: LoadContext<Item>): Promise<
    Result<v.InferOutput<Item['data']>, DomainError>
  > {
    return ok({ itemId: params.itemId });
  }
}

const RowsUiModuleDef = UiModuleDef.define({
  name: 'rows',
  label: 'Строки',
  description: 'Доска и карточка строки.',
  screens: [BoardScreenDef, ItemScreenDef],
  stories: [],
});

const RowsSetDef = UiSetDef.define({
  name: 'rowUi',
  label: 'Набор строк',
  description: 'Локальные экраны действий строки.',
  app: ExampleAppDef,
  modules: [RowsUiModuleDef],
});

const entry = (label: string, address: Address) => ({
  label,
  description: `Вход: ${label}.`,
  address,
});

const RowsAppDef = UiAppDef.define({
  name: 'rowDialog',
  label: 'Строки',
  description: 'Приложение UI экранов действий строки.',
  set: RowsSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: entry('Доска', BoardScreenDef.at({})),
  },
});

const views = AppChatViews.ofSet(RowsSetDef, [
  ChatViews.of(RowsUiModuleDef, [
    ScreenPresenter.for(
      BoardScreenDef,
      ({ data }) => `Доска: ${data?.items.length ?? 0}`,
    ),
    ScreenPresenter.for(
      ItemScreenDef,
      ({ data }) => `Карточка: ${data?.itemId}`,
    ),
  ]),
]);

const editing = () => MemoryMessenger.editing();
/** Мессенджер с тремя вариантами на сообщение: листание «Ещё». */
const windowed = () =>
  new MemoryMessenger({
    capabilities: MemoryMessenger.windowed(() => T0).capabilities,
    clock: () => T0,
  });

let signals = 0;
let requests = 0;
let epochs = 0;

const refreshSignal = (eventId: string): RefreshSignal => ({
  event: 'taskCreated',
  eventId,
  trace: Trace.fromEvent({ eventId, correlationId: eventId }).toJSON(),
});

const textOf = (message: Message) => PlainText.of(message.text);

const labelsOf = (message: Message) => message.options.map((o) => o.label);

const lastLine = (messenger: MemoryMessenger) => {
  const line = messenger.chat(PEER).at(-1);
  if (line === undefined) throw new Error('сообщений нет');
  return line;
};

const lastText = (messenger: MemoryMessenger) =>
  textOf(lastLine(messenger).message);

const lastLabels = (messenger: MemoryMessenger) =>
  labelsOf(lastLine(messenger).message);

/** Ссылка варианта `label` из самого свежего сообщения беседы, где он есть. */
const refOf = (messenger: MemoryMessenger, label: string): string => {
  for (const line of [...messenger.chat(PEER)].reverse()) {
    const option = line.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

/** Беседа на исполнителе с заглушками; `snapshot` — беседа после перезапуска на том же мессенджере. */
const sceneOf = (options: {
  readonly messenger: MemoryMessenger;
  readonly world?: World;
  readonly snapshot?: ConversationSnapshot;
}) => {
  const world = options.world ?? worldOf();
  const logger = new MemoryLogger();
  const { messenger } = options;
  const codes = AppCodeLoaders.ofSet(RowsSetDef, [
    CodeLoaders.of(RowsUiModuleDef, [
      CodeLoader.screen(BoardScreenDef, async () => new BoardCode(world)),
      CodeLoader.screen(ItemScreenDef, async () => new ItemCode()),
    ]),
  ]);
  const kit = new RuntimeKit(codes);
  const conversation = new Conversation(
    {
      app: RowsAppDef,
      runtime: kit.runtime,
      contexts: { context: async () => testRenderContext },
      traces: new DialogTraces(() => {
        requests += 1;
        return `r-${requests}`;
      }),
      views,
      messenger,
      logger,
      peer: PEER,
      person: A,
      home: 'start',
      epochs: () => {
        epochs += 1;
        return `ep${String(epochs).padStart(3, '0')}`;
      },
    },
    options.snapshot,
  );
  const head = () => {
    signals += 1;
    return { id: `s-${signals}`, peer: PEER, sender: 'sender-a' };
  };
  const pressRef = async (ref: string): Promise<string> => {
    const at = head();
    const press = `p-${at.id}`;
    await conversation.receive({ ...at, kind: 'press', ref, press });
    return press;
  };
  return {
    kit,
    world,
    messenger,
    conversation,
    logger,
    enter: async () => {
      await conversation.receive({ ...head(), kind: 'enter', entry: 'start' });
    },
    pressRef,
    press: (label: string) => pressRef(refOf(messenger, label)),
    /** Перечитывание по событию и ожидание проактивного показа (TST-04). */
    refresh: async () => {
      signals += 1;
      kit.refresh.emit(refreshSignal(`e-${signals}`));
      await conversation.settled();
    },
  };
};

describe('Conversation — строки списка кнопками', () => {
  test('N строк — N кнопок на месте действия, в порядке actions; подписи действий строки в кнопках нет', async () => {
    const s = sceneOf({ messenger: editing() });

    await s.enter();

    expect(lastText(s.messenger)).toBe('Доска: 2');
    expect(lastLabels(s.messenger)).toEqual([
      'Хлеб',
      'Молоко',
      'Обновить',
      'Сыр',
    ]);
  });

  test('список пуст — кнопок действия нет, остальные на месте', async () => {
    const s = sceneOf({
      messenger: editing(),
      world: { ...worldOf(), items: [] },
    });

    await s.enter();

    expect(lastLabels(s.messenger)).toEqual(['Обновить', 'Сыр']);
  });

  test('действие отключено — один вариант с пометкой и подписью действия, строк нет', async () => {
    const s = sceneOf({
      messenger: editing(),
      world: { ...worldOf(), openOff: true },
    });

    await s.enter();

    expect(lastLabels(s.messenger)).toEqual(['Обновить', 'Сыр', '🚫 Открыть']);
  });
});

describe('Conversation — нажатие строки', () => {
  test('переход на экран ребёнка с ключом строки: без вопроса и без черновика', async () => {
    const s = sceneOf({ messenger: editing() });
    await s.enter();

    await s.press('Молоко');

    expect(s.conversation.screen()?.address).toEqual({
      screen: ITEM,
      params: { itemId: 'm2' },
    });
    expect(lastText(s.messenger)).toBe('Карточка: m2');
  });

  test('строки с одной подписью — разные кнопки: нажатие второй несёт её ключ', async () => {
    const twins = [
      { id: 'twin-1', title: 'Хлеб' },
      { id: 'twin-2', title: 'Хлеб' },
    ];
    const s = sceneOf({
      messenger: editing(),
      world: { ...worldOf(), items: twins },
    });
    await s.enter();
    const refs = lastLine(s.messenger)
      .message.options.filter((o) => o.label === 'Хлеб')
      .map((o) => o.ref);

    await s.pressRef(refs[1] ?? '');

    expect(refs).toHaveLength(2);
    expect(refs[0]).not.toBe(refs[1]);
    expect(s.conversation.screen()?.address.params).toEqual({
      itemId: 'twin-2',
    });
  });

  test('действие с confirm — подтверждение, «Да» исполняет со входом строки; ключ не попадает в лог', async () => {
    const s = sceneOf({
      messenger: editing(),
      world: { ...worldOf(), extras: [{ id: MARKED_KEY, title: 'Сыр' }] },
    });
    await s.enter();

    await s.press('Сыр');
    const asked = lastLine(s.messenger).message;
    const before = [...s.world.calls];
    await s.press('Да');

    expect(textOf(asked)).toBe('Удалить строку?\n\nВернуть нельзя.');
    expect(labelsOf(asked)).toEqual(['Да', 'Нет']);
    expect(before).toEqual([]);
    expect(s.world.calls).toEqual([`drop:${MARKED_KEY}`]);
    expect(JSON.stringify(s.logger.records)).not.toContain('mark-q7');
  });

  test('«Нет» в подтверждении — вид снова, действие не исполнено', async () => {
    const s = sceneOf({ messenger: editing() });
    await s.enter();

    await s.press('Сыр');
    await s.press('Нет');

    expect(s.world.calls).toEqual([]);
    expect(lastText(s.messenger)).toBe('Доска: 2');
  });

  test('ссылка прежней ревизии после перечитывания — «Экран обновился.», строка не открыта', async () => {
    const s = sceneOf({ messenger: editing() });
    await s.enter();
    const milk = refOf(s.messenger, 'Молоко');
    s.world.items = [BREAD];
    await s.refresh();

    await s.pressRef(milk);

    expect(lastText(s.messenger)).toBe('Экран обновился.\n\nДоска: 1');
    expect(s.conversation.screen()?.address.screen).toBe(BOARD);
  });

  test('ключ не из строк живого вида (ссылка из снимка) — rejected: вид с замечанием, переход не выполнен', async () => {
    const messenger = editing();
    const first = sceneOf({ messenger });
    await first.enter();
    const saved = first.conversation.snapshot();
    const screen = saved.screen;
    if (screen === undefined) throw new Error('в снимке нет экрана');
    const foreign: RefEntry = {
      ref: 'foreign1',
      kind: 'row',
      screen: screen.serial,
      revision: (screen.instance as { revision: number }).revision,
      action: 'open',
      input: { itemId: 'нет-такой' },
      label: 'Чужая',
    };
    first.conversation.close();
    const second = sceneOf({
      messenger,
      snapshot: { ...saved, refs: [...saved.refs, foreign] },
    });

    await second.pressRef('foreign1');

    expect(lastText(messenger)).toContain('Строки нет в списке');
    expect(second.conversation.screen()?.address.screen).toBe(BOARD);
  });
});

describe('Conversation — строки сверх лимита вариантов', () => {
  test('страницы с «Ещё» по кругу; строка на второй странице открывает свой экран', async () => {
    const s = sceneOf({
      messenger: windowed(),
      world: { ...worldOf(), items: [BREAD, MILK, CHEESE], extras: [] },
    });

    await s.enter();
    const first = lastLabels(s.messenger);
    await s.press('Ещё');
    const second = lastLabels(s.messenger);
    await s.press('Ещё');
    const again = lastLabels(s.messenger);
    await s.press('Ещё');
    await s.press('Сыр');

    expect(first).toEqual(['Хлеб', 'Молоко', 'Ещё']);
    expect(second).toEqual(['Сыр', 'Обновить', 'Ещё']);
    expect(again).toEqual(first);
    expect(s.conversation.screen()?.address.params).toEqual({ itemId: 'c3' });
  });
});

describe('Conversation — запись row и снимок беседы', () => {
  test('запись row в снимке: экран, ревизия, действие, вход и подпись; снимок проходит схему и круг JSON', async () => {
    const s = sceneOf({ messenger: editing() });
    await s.enter();

    const snapshot = s.conversation.snapshot();
    const round = JSON.parse(JSON.stringify(snapshot));
    const rows = snapshot.refs.filter(
      (entry) => entry.kind === 'row' && entry.action === 'open',
    );

    expect(rows).toMatchObject([
      { action: 'open', input: { itemId: 'b1' }, label: 'Хлеб' },
      { action: 'open', input: { itemId: 'm2' }, label: 'Молоко' },
    ]);
    expect(round).toEqual(snapshot);
    expect(v.safeParse(ConversationSnapshotSchema, round).success).toBe(true);
  });

  test('после перезапуска из снимка нажатие строки по прежней ссылке открывает карточку', async () => {
    const messenger = editing();
    const first = sceneOf({ messenger });
    await first.enter();
    const saved = JSON.parse(JSON.stringify(first.conversation.snapshot()));
    first.conversation.close();
    const second = sceneOf({ messenger, snapshot: saved });

    await second.press('Молоко');

    expect(second.conversation.screen()?.address).toEqual({
      screen: ITEM,
      params: { itemId: 'm2' },
    });
    expect(lastText(messenger)).toBe('Карточка: m2');
  });
});
