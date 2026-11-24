import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type Address,
  AppCodeLoaders,
  CodeLoader,
  CodeLoaders,
  type DataOf,
  type LoadContext,
  ScreenCode,
  ScreenDef,
  StoryDef,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { RuntimeKit, testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogTraces } from '../dialog/dialog-traces';
import { PlainText } from '../message/plain-text';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import type {
  ConversationExit,
  ConversationSnapshot,
} from './conversation.types';

// Выход сторис в беседе: цель решает ядро (`ExitTargets`), беседа
// исполняет. «Назад» — верх пути с перечитыванием, `home` — вход приложения,
// адрес — экран по адресу. Приёмник выхода (D-UI-90) спрашивается первым.
// Путь сцены: хаб → список → элемент; выход — на элементе.

const A = testUuid(1);
const PEER = 'peer-a';
const HUB = 'exitUi/flow/hub';
const LIST = 'exitUi/flow/list';
const BOARD = 'exitUi/flow/board';
const EXIT_LEAD = 'Работа завершена\n\nРабота с элементом окончена.';
const NOT_RESTORED = 'Прежний экран не восстановлен — начнём сначала.';

type World = { count: number };

const HubScreenDef = ScreenDef.define({
  name: 'hub',
  label: 'Хаб',
  description: 'Вход приложения.',
  reads: [],
  data: v.object({}),
  actions: {
    open: {
      label: 'К списку',
      description: 'Список элементов.',
      to: () => [ListScreenDef],
    },
  },
});

const ListScreenDef = ScreenDef.define({
  name: 'list',
  label: 'Список',
  description: 'Список элементов.',
  reads: [],
  data: v.object({ count: v.pipe(v.number(), v.description('Число')) }),
  actions: {
    open: {
      label: 'Открыть',
      description: 'Элемент списка.',
      to: () => [ItemScreenDef],
    },
  },
});

const ItemScreenDef = ScreenDef.define({
  name: 'item',
  label: 'Элемент',
  description: 'Элемент со своим выходом.',
  reads: [],
  data: v.object({}),
  actions: {
    finish: { label: 'Завершить', description: 'Выход сторис.' },
  },
  exits: {
    done: {
      label: 'Работа завершена',
      description: 'Работа с элементом окончена.',
    },
  },
});

const BoardScreenDef = ScreenDef.define({
  name: 'board',
  label: 'Доска',
  description: 'Экран с параметром — цель-адрес.',
  params: v.strictObject({
    page: v.pipe(v.number(), v.description('Страница')),
  }),
  reads: [],
  data: v.object({ page: v.pipe(v.number(), v.description('Страница')) }),
});

class HubCode extends ScreenCode<typeof HubScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof HubScreenDef>> = {
    open: { done: () => ListScreenDef.at({}) },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class ListCode extends ScreenCode<typeof ListScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof ListScreenDef>> = {
    open: { done: () => ItemScreenDef.at({}) },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<
    Result<DataOf<typeof ListScreenDef>, DomainError>
  > {
    return ok({ count: this.world.count });
  }
}

class ItemCode extends ScreenCode<typeof ItemScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof ItemScreenDef>> = {
    finish: { done: () => ItemScreenDef.exits.done.with() },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class BoardCode extends ScreenCode<typeof BoardScreenDef> {
  override async load({
    params,
  }: LoadContext<typeof BoardScreenDef>): Promise<
    Result<DataOf<typeof BoardScreenDef>, DomainError>
  > {
    return ok({ page: params.page });
  }
}

/** Цель исхода сторис; `undefined` — умолчание. */
type Then = 'back' | 'home' | Address | undefined;

const storyOf = (to: Then) =>
  StoryDef.define({
    name: 'work',
    label: 'Работа',
    description: 'Работа с элементом.',
    callers: ['user'],
    goal: 'чтобы закончить работу',
    start: ItemScreenDef,
    screens: [ItemScreenDef],
    outcomes: {
      done: {
        label: 'Работа завершена',
        description: 'Работа с элементом окончена.',
        exits: [ItemScreenDef.exits.done],
        ...(to === undefined ? {} : { after: to }),
      },
    },
  });

const ModuleDef = (story: ReturnType<typeof storyOf>) =>
  UiModuleDef.define({
    name: 'flow',
    label: 'Поток',
    description: 'Хаб, список, элемент и доска.',
    screens: [HubScreenDef, ListScreenDef, ItemScreenDef, BoardScreenDef],
    stories: [story],
  });

const SetDef = (module: ReturnType<typeof ModuleDef>) =>
  UiSetDef.define({
    name: 'exitUi',
    label: 'Набор выходов',
    description: 'Экраны выхода сторис в беседе.',
    app: ExampleAppDef,
    modules: [module],
  });

const entry = (label: string, address: Address) => ({
  label,
  description: `Вход: ${label}.`,
  address,
});

const MESSENGER = () => MemoryMessenger.editing();

let signals = 0;
let requests = 0;
let epochs = 0;

const head = () => {
  signals += 1;
  return { id: `s-${signals}`, peer: PEER, sender: 'sender-a' };
};

const textOf = (messenger: MemoryMessenger, at = -1) => {
  const line = messenger.chat(PEER).at(at);
  if (line === undefined) throw new Error('сообщений нет');
  return PlainText.of(line.message.text);
};

const refOf = (messenger: MemoryMessenger, label: string): string => {
  for (const line of [...messenger.chat(PEER)].reverse()) {
    const option = line.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

const Step = v.object({ address: v.object({ screen: v.string() }) });

/** Беседа сцены: `to` — цель исхода, `stories: false` — приложение без сторис. */
const sceneOf = (options: {
  readonly to?: Then;
  readonly stories?: boolean;
  readonly exits?: 'accept' | 'refuse';
  readonly messenger?: MemoryMessenger;
  readonly snapshot?: ConversationSnapshot;
}) => {
  const story = storyOf(options.to);
  const module = ModuleDef(story);
  const set = SetDef(module);
  const app = UiAppDef.define({
    name: 'exitDialog',
    label: 'Выходы',
    description: 'Приложение UI выходов сторис в беседе.',
    set,
    channel: DIALOG_CHANNEL,
    stories: options.stories === false ? [] : [story],
    entries: {
      start: entry('Хаб', HubScreenDef.at({})),
      item: entry('Элемент', ItemScreenDef.at({})),
    },
  });
  const world: World = { count: 2 };
  const taken: ConversationExit[] = [];
  const codes = AppCodeLoaders.ofSet(set, [
    CodeLoaders.of(module, [
      CodeLoader.screen(HubScreenDef, async () => new HubCode()),
      CodeLoader.screen(ListScreenDef, async () => new ListCode(world)),
      CodeLoader.screen(ItemScreenDef, async () => new ItemCode()),
      CodeLoader.screen(BoardScreenDef, async () => new BoardCode()),
    ]),
  ]);
  const kit = new RuntimeKit(codes);
  const messenger = options.messenger ?? MESSENGER();
  const conversation = new Conversation(
    {
      app,
      runtime: kit.runtime,
      contexts: { context: async () => testRenderContext },
      traces: new DialogTraces(() => {
        requests += 1;
        return `r-${requests}`;
      }),
      views: ChatViews.of(set, [
        ScreenPresenter.for(HubScreenDef, () => 'Хаб'),
        ScreenPresenter.for(
          ListScreenDef,
          ({ data }) => `Список: ${data?.count}`,
        ),
        ScreenPresenter.for(ItemScreenDef, () => 'Элемент'),
        ScreenPresenter.for(
          BoardScreenDef,
          ({ data }) => `Доска ${data?.page}`,
        ),
      ]),
      messenger,
      logger: new MemoryLogger(),
      peer: PEER,
      person: A,
      home: 'start',
      ...(options.exits === undefined
        ? {}
        : {
            exits: {
              accept: async (exit: ConversationExit) => {
                taken.push(exit);
                return options.exits === 'accept';
              },
            },
          }),
      epochs: () => {
        epochs += 1;
        return `ep${String(epochs).padStart(3, '0')}`;
      },
    },
    options.snapshot,
  );
  const press = async (label: string) => {
    const at = head();
    await conversation.receive({
      ...at,
      kind: 'press',
      ref: refOf(messenger, label),
      press: `p-${at.id}`,
    });
  };
  return {
    world,
    taken,
    messenger,
    conversation,
    press,
    enter: (name: string) =>
      conversation.receive({ ...head(), kind: 'enter', entry: name }),
    /** Хаб → список → элемент: путь «хаб, список», живой экран — элемент. */
    toItem: async () => {
      await conversation.receive({ ...head(), kind: 'enter', entry: 'start' });
      await press('К списку');
      await press('Открыть');
    },
    screen: () => conversation.screen()?.address,
    path: () =>
      v
        .parse(v.array(Step), conversation.snapshot().path ?? [])
        .map((step) => step.address.screen),
  };
};

/** Беседа после перезапуска: верх пути в снимке — экран, которого в наборе нет. */
const restartedWithGoneTop = async (messenger: MemoryMessenger) => {
  const first = sceneOf({ messenger });
  await first.toItem();
  const saved = first.conversation.snapshot();
  first.conversation.close();
  const gone = {
    address: { screen: 'exitUi/flow/gone', params: {} },
    state: {},
    revision: 1,
  };
  return sceneOf({
    messenger,
    snapshot: { ...saved, path: [...(saved.path ?? []).slice(0, -1), gone] },
  });
};

describe('Conversation — выход сторис: назад', () => {
  test('верх пути восстановлен и живой, путь снят на один элемент', async () => {
    const s = sceneOf({});
    await s.toItem();

    await s.press('Завершить');

    expect(s.screen()?.screen).toBe(LIST);
    expect(s.path()).toEqual([HUB]);
  });

  test('данные верха пути перечитаны, текст выхода — перед видом одним показом', async () => {
    const s = sceneOf({});
    await s.toItem();
    s.world.count = 5;
    const lines = s.messenger.chat(PEER).length;

    await s.press('Завершить');

    expect(textOf(s.messenger)).toBe(`${EXIT_LEAD}\n\nСписок: 5`);
    expect(s.messenger.chat(PEER)).toHaveLength(lines);
  });

  test('приложение без сторис — тоже назад', async () => {
    const s = sceneOf({ stories: false });
    await s.toItem();

    await s.press('Завершить');

    expect(s.screen()?.screen).toBe(LIST);
    expect(s.path()).toEqual([HUB]);
  });

  test('путь пуст — вход home с текстом выхода перед видом', async () => {
    const s = sceneOf({});
    await s.enter('item');

    await s.press('Завершить');

    expect(s.screen()?.screen).toBe(HUB);
    expect(textOf(s.messenger)).toBe(`${EXIT_LEAD}\n\nХаб`);
  });

  test('верх пути не восстановился — заметка и вход home, путь снят', async () => {
    const messenger = MESSENGER();
    const second = await restartedWithGoneTop(messenger);

    await second.press('Завершить');

    const texts = messenger.chat(PEER).map((l) => PlainText.of(l.message.text));
    expect(texts.at(-2)).toBe(NOT_RESTORED);
    expect(texts.at(-1)).toEndWith('Хаб');
    expect(second.screen()?.screen).toBe(HUB);
    expect(second.conversation.snapshot()).not.toHaveProperty('path');
  });
});

describe('Conversation — выход сторис: home и адрес', () => {
  test('home при непустом пути — путь сброшен, вход home', async () => {
    const s = sceneOf({ to: 'home' });
    await s.toItem();

    await s.press('Завершить');

    expect(s.screen()?.screen).toBe(HUB);
    expect(s.conversation.snapshot()).not.toHaveProperty('path');
  });

  test('адрес — экран открыт с параметрами, путь прежний', async () => {
    const s = sceneOf({ to: BoardScreenDef.at({ page: 2 }) });
    await s.toItem();

    await s.press('Завершить');

    expect(s.screen()).toEqual({ screen: BOARD, params: { page: 2 } });
    expect(textOf(s.messenger)).toBe(`${EXIT_LEAD}\n\nДоска 2`);
    expect(s.path()).toEqual([HUB, LIST]);
  });

  test('адрес экрана из пути — путь обрезан до него, экран открыт заново', async () => {
    const s = sceneOf({ to: ListScreenDef.at({}) });
    await s.toItem();
    s.world.count = 7;

    await s.press('Завершить');

    expect(s.screen()?.screen).toBe(LIST);
    expect(textOf(s.messenger)).toContain('Список: 7');
    expect(s.path()).toEqual([HUB]);
  });
});

describe('Conversation — выход сторис: приёмник выхода', () => {
  test('принял при непустом пути — путь сброшен, цель не исполнена', async () => {
    const s = sceneOf({ to: 'home', exits: 'accept' });
    await s.toItem();

    await s.press('Завершить');

    expect(s.taken).toHaveLength(1);
    expect(s.screen()).toBeUndefined();
    expect(s.conversation.snapshot()).not.toHaveProperty('path');
  });

  test('не принял при непустом пути — цель исполнена: назад', async () => {
    const s = sceneOf({ exits: 'refuse' });
    await s.toItem();

    await s.press('Завершить');

    expect(s.taken).toHaveLength(1);
    expect(s.screen()?.screen).toBe(LIST);
    expect(s.path()).toEqual([HUB]);
  });
});
