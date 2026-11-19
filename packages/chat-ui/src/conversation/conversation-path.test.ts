import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result, Trace } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  ExampleApp,
  ExampleAppDef,
  TaskErrors,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type AnyScreenDef,
  CodeLoader,
  CodeLoaders,
  type DataOf,
  type InstanceJson,
  type LoadContext,
  type RefreshSignal,
  ScreenCode,
  ScreenDef,
  type StateOf,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import { MemoryUiObserver } from 'dmg-ui/testing';
import { RuntimeKit, T0, testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogTraces } from '../dialog/dialog-traces';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import { MAX_STEP_LENGTH } from './conversation.const';
import type {
  ConversationSignal,
  ConversationSnapshot,
} from './conversation.types';
import { ConversationPath } from './conversation-path';
import { ConversationSnapshotSchema } from './conversation-snapshot';
import { Conversations } from './conversations';
import { MemoryConversationStore } from './memory-conversation-store';

// Путь переходов и «Назад»: беседа помнит снимки экземпляров (адрес и
// состояние) экранов, с которых ушла переходом на другой экран, и поднимает
// верхний по варианту «Назад» или сигналу `back`. Сцена — набор из двух
// UI-модулей: `roster` (список по страницам с пометкой в состоянии) и
// `people` (профиль по личности, заметки, где представление прячет «Назад»,
// и цепочка звеньев для предела пути). Проверки — по `MemoryMessenger.chat`,
// журналу, живому экрану и снимку беседы.

const A = testUuid(1);
const PEER = 'peer-a';
const PERSON = 'p-7';
const OTHER = 'p-8';
const MARK = 'пометка-k3';
const MISSING = testUuid(9);
const LIST = 'pathUi/roster/list';
const PROFILE = 'pathUi/people/profile';
const NOTES = 'pathUi/people/notes';
const HOP_COUNT = 18;
const tmp = useTempDir('dmg-ui-conversation-path-');

const hopId = (i: number) => `pathUi/people/hop${i}`;

/** Данные экранов сцены: тест меняет их между сигналами, код читает при загрузке и пишет вызовы. */
type World = {
  count: number;
  broken: boolean;
  readonly calls: string[];
};

const worldOf = (): World => ({ count: 2, broken: false, calls: [] });

/** Список людей модуля `roster`: страница — параметр, пометка — состояние, профиль — экран модуля `people`. */
const RosterScreenDef = ScreenDef.define({
  name: 'list',
  label: 'Список',
  description: 'Список людей по страницам с пометкой и переходом в профиль.',
  params: v.strictObject({
    page: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.description('Номер страницы'),
    ),
  }),
  reads: [],
  data: v.object({
    page: v.pipe(v.number(), v.description('Номер страницы')),
    count: v.pipe(v.number(), v.description('Число людей')),
  }),
  state: v.strictObject({
    filter: v.pipe(v.string(), v.description('Пометка списка')),
  }),
  actions: {
    open: {
      label: 'Профиль',
      description: 'Профиль человека — экран другого UI-модуля.',
      to: (): readonly AnyScreenDef[] => [ProfileScreenDef],
    },
    next: { label: 'Дальше', description: 'Следующая страница списка.' },
  },
  locals: {
    mark: { label: 'Пометить', description: 'Ставит пометку списка.' },
  },
});

/** Профиль модуля `people`: личность — параметр; заметки, другой профиль, возврат к списку. */
const ProfileScreenDef = ScreenDef.define({
  name: 'profile',
  label: 'Профиль',
  description: 'Профиль человека по личности.',
  params: v.strictObject({
    personId: v.pipe(v.string(), v.description('Личность')),
  }),
  reads: [],
  data: v.object({
    personId: v.pipe(v.string(), v.description('Личность')),
  }),
  actions: {
    notes: {
      label: 'Заметки',
      description: 'Заметки о человеке.',
      to: (): readonly AnyScreenDef[] => [NotesScreenDef],
    },
    other: { label: 'Другой', description: 'Профиль другого человека.' },
    toList: {
      label: 'К списку',
      description: 'Список с первой страницы.',
      to: (): readonly AnyScreenDef[] => [RosterScreenDef],
    },
  },
});

/** Заметки: возврат в профиль, ввод текстом и выход сторис; представление прячет «Назад». */
const NotesScreenDef = ScreenDef.define({
  name: 'notes',
  label: 'Заметки',
  description: 'Заметки о человеке.',
  reads: [],
  data: v.object({}),
  actions: {
    toProfile: {
      label: 'К профилю',
      description: 'Профиль, с которого пришли.',
      to: (): readonly AnyScreenDef[] => [ProfileScreenDef],
    },
    add: {
      label: 'Добавить',
      description: 'Заметка текстом.',
      input: v.object({ text: v.pipe(v.string(), v.description('Текст')) }),
    },
    done: { label: 'Готово', description: 'Выход сторис.' },
  },
  exits: {
    done: {
      label: 'Заметки закрыты',
      description: 'Работа с заметками окончена.',
    },
  },
});

/** Звено цепочки: переход на следующее звено — другой экран, путь растёт. */
const hopOf = (i: number) =>
  ScreenDef.define({
    name: `hop${i}`,
    label: `Звено ${i}`,
    description: 'Звено цепочки переходов.',
    reads: [],
    data: v.object({}),
    actions: {
      go: {
        label: 'Вперёд',
        description: 'Следующее звено.',
        to: (): readonly AnyScreenDef[] => [hopAt(i + 1)],
      },
    },
  });

type Hop = ReturnType<typeof hopOf>;

const HOPS: readonly Hop[] = Array.from({ length: HOP_COUNT }, (_, i) =>
  hopOf(i),
);

/** Звено по номеру; последнее ведёт на первое (его не нажимают). */
const hopAt = (i: number): Hop => {
  const hop = HOPS[i % HOP_COUNT];
  if (hop === undefined) throw new Error(`нет звена ${i}`);
  return hop;
};

type Roster = typeof RosterScreenDef;
type Profile = typeof ProfileScreenDef;
type Notes = typeof NotesScreenDef;

class RosterCode extends ScreenCode<Roster> {
  override readonly locals = {
    mark: (): StateOf<Roster> => ({ filter: MARK }),
  };

  override readonly actions: Partial<ActionSteps<Roster>> = {
    open: { done: () => ProfileScreenDef.at({ personId: PERSON }) },
    next: {
      done: ({ params }) => RosterScreenDef.at({ page: params.page + 1 }),
    },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load({
    params,
  }: LoadContext<Roster>): Promise<Result<DataOf<Roster>, DomainError>> {
    return ok({ page: params.page, count: this.world.count });
  }

  override initialState(): StateOf<Roster> {
    return { filter: '' };
  }
}

class ProfileCode extends ScreenCode<Profile> {
  override readonly actions: Partial<ActionSteps<Profile>> = {
    notes: { done: () => NotesScreenDef.at({}) },
    other: { done: () => ProfileScreenDef.at({ personId: OTHER }) },
    toList: { done: () => RosterScreenDef.at({ page: 0 }) },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load({
    params,
  }: LoadContext<Profile>): Promise<Result<DataOf<Profile>, DomainError>> {
    if (this.world.broken) {
      return TaskErrors.NOT_FOUND.err({ taskId: MISSING });
    }
    return ok({ personId: params.personId });
  }
}

class NotesCode extends ScreenCode<Notes> {
  override readonly actions: Partial<ActionSteps<Notes>> = {
    toProfile: { done: () => ProfileScreenDef.at({ personId: PERSON }) },
    add: {
      done: ({ input }) => {
        this.world.calls.push(`add:${input.text}`);
        return NotesScreenDef.at({});
      },
    },
    done: { done: () => NotesScreenDef.exits.done.with() },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class HopCode extends ScreenCode<Hop> {
  override readonly actions: Partial<ActionSteps<Hop>> = {
    go: { done: () => hopAt(this.index + 1).at({}) },
  };

  constructor(private readonly index: number) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

const PathSetDef = UiSetDef.define({
  name: 'pathUi',
  label: 'Набор пути',
  description: 'Два UI-модуля: список людей и люди.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'roster',
      label: 'Список',
      description: 'Список людей по страницам.',
      screens: [RosterScreenDef],
      stories: [],
    }),
    UiModuleDef.define({
      name: 'people',
      label: 'Люди',
      description: 'Профиль, заметки и цепочка звеньев.',
      screens: [ProfileScreenDef, NotesScreenDef, ...HOPS],
      stories: [],
    }),
  ],
});

const PathAppDef = UiAppDef.define({
  name: 'pathDialog',
  label: 'Путь',
  description: 'Приложение UI набора из двух модулей.',
  set: PathSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Список',
      description: 'Список с первой страницы.',
      address: RosterScreenDef.at({ page: 0 }),
    },
    notes: {
      label: 'Заметки',
      description: 'Заметки без пути.',
      address: NotesScreenDef.at({}),
    },
    hops: {
      label: 'Цепочка',
      description: 'Первое звено цепочки.',
      address: hopAt(0).at({}),
    },
  },
});

const views = ChatViews.of(PathSetDef, [
  ScreenPresenter.for(
    RosterScreenDef,
    ({ data, state }) =>
      `Список: страница ${data?.page ?? 0}, людей ${data?.count ?? 0}, пометка «${state?.filter ?? ''}»`,
  ),
  ScreenPresenter.for(
    ProfileScreenDef,
    ({ data }) => `Профиль ${data?.personId ?? ''}`,
  ),
  ScreenPresenter.of(NotesScreenDef, {
    render: (_view, kit) =>
      kit.message(
        'Заметки',
        kit.options.filter((option) => option.kind !== 'back'),
      ),
  }),
  ...HOPS.map((hop, i) => ScreenPresenter.for(hop, () => `Звено ${i}`)),
]);

const codesOf = (world: World) =>
  CodeLoaders.of(PathSetDef, [
    CodeLoader.screen(RosterScreenDef, async () => new RosterCode(world)),
    CodeLoader.screen(ProfileScreenDef, async () => new ProfileCode(world)),
    CodeLoader.screen(NotesScreenDef, async () => new NotesCode(world)),
    ...HOPS.map((hop, i) => CodeLoader.screen(hop, async () => new HopCode(i))),
  ]);

const editingMessenger = () => MemoryMessenger.editing();

const windowedMessenger = () => MemoryMessenger.windowed(() => T0);

const MESSENGERS = [
  ['editing', editingMessenger],
  ['windowed', windowedMessenger],
] as const;

// id сигналов, запросов и эпох — сквозные на файл: беседа из снимка не
// получает id, уже отсеянный прежним воплощением.
let signals = 0;
let requests = 0;
let epochs = 0;

const head = () => {
  signals += 1;
  return { id: `s-${signals}`, peer: PEER, sender: 'sender-a' };
};

/** Сигнал перечитывания по событию — как от сервера: след события. */
const refreshSignal = (eventId: string): RefreshSignal => ({
  event: 'taskCreated',
  eventId,
  trace: Trace.fromEvent({ eventId, correlationId: eventId }).toJSON(),
});

/** Сигнал «Назад» собеседника: у мессенджеров — команда или жест, не нажатие варианта. */
const backSignal = (): ConversationSignal => ({ ...head(), kind: 'back' });

const textOf = (message: Message) => PlainText.of(message.text);

const labelsOf = (message: Message) => message.options.map((o) => o.label);

const lastLine = (messenger: MemoryMessenger) => {
  const line = messenger.chat(PEER).at(-1);
  if (line === undefined) throw new Error('сообщений нет');
  return line;
};

const lastText = (messenger: MemoryMessenger) =>
  textOf(lastLine(messenger).message);

const textsOf = (messenger: MemoryMessenger) =>
  messenger.chat(PEER).map((line) => textOf(line.message));

/** Живое место глазами собеседника — последнее сообщение с вариантами. */
const placeOf = (messenger: MemoryMessenger) => {
  const line = [...messenger.chat(PEER)]
    .reverse()
    .find((l) => l.message.options.length > 0);
  if (line === undefined) throw new Error('сообщений с вариантами нет');
  return line.message;
};

/** Ссылка варианта `label` из самого свежего сообщения беседы, где он есть. */
const refOf = (messenger: MemoryMessenger, label: string): string => {
  for (const line of [...messenger.chat(PEER)].reverse()) {
    const option = line.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

/** Операции журнала начиная с `from` — коротко: вид, handle, текст ответа. */
const opsOf = (messenger: MemoryMessenger, from = 0): string[] =>
  messenger.journal.slice(from).map((record) => {
    switch (record.op) {
      case 'sent':
        return `${record.via} ${record.handle}`;
      case 'edited':
        return `edit ${record.handle}`;
      case 'retired':
        return `retire ${record.handle}`;
      case 'answered':
        return record.text === undefined ? 'answer' : `answer «${record.text}»`;
      case 'undelivered':
        return `undelivered ${record.via} ${record.reason}`;
      case 'community':
        return `community ${record.operation}`;
      default: {
        const unknown: never = record;
        throw new Error(`неизвестная запись ${String(unknown)}`);
      }
    }
  });

/** Элемент пути в снимке: снимок экземпляра ядра. */
const Step = v.object({
  address: v.object({ screen: v.string(), params: v.unknown() }),
  state: v.unknown(),
  revision: v.number(),
});

/** Путь беседы из её снимка, старые первыми; пустой путь — `[]`. */
const pathOf = (conversation: Conversation) =>
  v.parse(v.array(Step), conversation.snapshot().path ?? []);

/** Экраны пути по порядку. */
const screensOf = (conversation: Conversation) =>
  pathOf(conversation).map((step) => step.address.screen);

/** Беседа на исполнителе с заглушками; `snapshot` — беседа после перезапуска на том же мессенджере. */
const sceneOf = (options: {
  readonly messenger: MemoryMessenger;
  readonly snapshot?: ConversationSnapshot;
  readonly views?: ChatViews;
}) => {
  const world = worldOf();
  const { messenger } = options;
  const kit = new RuntimeKit(codesOf(world), PathSetDef);
  /** Порт контекста рендера: `broken` — бросает (открытие и `restore` экрана). */
  const port = { broken: false };
  const conversation = new Conversation(
    {
      app: PathAppDef,
      runtime: kit.runtime,
      contexts: {
        context: async () => {
          if (port.broken) throw new Error('context-mark-q7');
          return testRenderContext;
        },
      },
      traces: new DialogTraces(() => {
        requests += 1;
        return `r-${requests}`;
      }),
      views: options.views ?? views,
      messenger,
      logger: new MemoryLogger(),
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
  /** Нажатие по ссылке; возвращает id нажатия — для проверки ответа. */
  const pressRef = async (ref: string): Promise<string> => {
    const at = head();
    const press = `p-${at.id}`;
    await conversation.receive({ ...at, kind: 'press', ref, press });
    return press;
  };
  /** Ссылка варианта `label` живого места; у мессенджера с тремя вариантами — листая «Ещё». */
  const reveal = async (label: string): Promise<string> => {
    for (let turn = 0; turn < 8; turn += 1) {
      const options = placeOf(messenger).options;
      const option = options.find((o) => o.label === label);
      if (option !== undefined) return option.ref;
      const more = options.find((o) => o.label === 'Ещё');
      if (more === undefined) break;
      await pressRef(more.ref);
    }
    throw new Error(`нет варианта «${label}» в живом месте`);
  };
  return {
    kit,
    world,
    port,
    messenger,
    conversation,
    enter: async (entry: string) => {
      await conversation.receive({ ...head(), kind: 'enter', entry });
    },
    text: async (text: string) => {
      await conversation.receive({ ...head(), kind: 'text', text });
    },
    back: async () => {
      await conversation.receive(backSignal());
    },
    pressRef,
    reveal,
    press: async (label: string) => pressRef(await reveal(label)),
    /** Перечитывание по событию и ожидание проактивного показа (TST-04). */
    refresh: async () => {
      const at = head();
      kit.refresh.emit(refreshSignal(`e-${at.id}`));
      await conversation.settled();
    },
  };
};

type Scene = ReturnType<typeof sceneOf>;

describe.each(MESSENGERS)(
  'Conversation — путь и «Назад» (%s)',
  (name, make) => {
    const editing = name === 'editing';

    /** Показ в живое место после `from`: правка на месте и ответ без текста — или новое через `update`. */
    const placed = (s: Scene, from: number) => {
      const handle = lastLine(s.messenger).handle;
      expect(opsOf(s.messenger, from)).toEqual(
        editing ? [`edit ${handle}`, 'answer'] : [`update ${handle}`],
      );
    };

    test('Назад после перехода в экран другого UI-модуля — прежний экран с параметрами и состоянием', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      await s.press('Дальше');
      await s.press('Пометить');
      const left = s.conversation.screen();
      await s.press('Профиль');
      const profile = s.conversation.screen();
      s.world.count = 5;
      const back = await s.reveal('Назад');
      const from = s.messenger.journal.length;

      await s.pressRef(back);

      expect(left).toMatchObject({
        address: { screen: LIST, params: { page: 1 } },
        state: { filter: MARK },
      });
      expect(profile?.address).toEqual({
        screen: PROFILE,
        params: { personId: PERSON },
      });
      expect(s.conversation.screen()?.address).toEqual(left?.address);
      expect(s.conversation.screen()?.state).toEqual(left?.state);
      // Данные загружены заново: число людей — уже новое.
      expect(lastText(s.messenger)).toBe(
        `Список: страница 1, людей 5, пометка «${MARK}»`,
      );
      expect(labelsOf(placeOf(s.messenger))).toEqual([
        'Профиль',
        'Дальше',
        'Пометить',
      ]);
      expect(s.conversation.snapshot()).not.toHaveProperty('path');
      placed(s, from);
    });

    test('вход приложения сбрасывает путь — «Назад» нет', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      await s.press('Пометить');
      await s.press('Профиль');
      const before = screensOf(s.conversation);

      await s.enter('start');
      const entered = placeOf(s.messenger);
      await s.back();

      expect(before).toEqual([LIST]);
      expect(labelsOf(entered)).toEqual(['Профиль', 'Дальше', 'Пометить']);
      expect(s.conversation.snapshot()).not.toHaveProperty('path');
      // «Назад» после входа в профиль не ведёт: живой экран — вход, снова.
      expect(s.conversation.screen()).toMatchObject({
        address: { screen: LIST, params: { page: 0 } },
        state: { filter: '' },
      });
      expect(lastText(s.messenger)).toBe(
        'Список: страница 0, людей 2, пометка «»',
      );
    });
  },
);

describe('Conversation — вариант «Назад» и сигнал back', () => {
  test('путь не пуст — вариант «Назад» в беседе, в снимке — запись back живого экрана; путь пуст — варианта нет', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    const list = labelsOf(lastLine(s.messenger).message);

    await s.press('Профиль');

    const snapshot = s.conversation.snapshot();
    expect(list).not.toContain('Назад');
    expect(labelsOf(lastLine(s.messenger).message)).toContain('Назад');
    const back = refOf(s.messenger, 'Назад');
    expect(snapshot.refs).toContainEqual({
      ref: back,
      kind: 'back',
      screen: snapshot.screen?.serial ?? -1,
      label: 'Назад',
    });
  });

  test('представление скрыло «Назад» — варианта нет, сигнал back ведёт назад', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Профиль');
    await s.press('Заметки');
    const notes = labelsOf(lastLine(s.messenger).message);
    const path = screensOf(s.conversation);

    await s.back();

    expect(notes).toEqual(['К профилю', 'Добавить', 'Готово']);
    expect(path).toEqual([LIST, PROFILE]);
    expect(s.conversation.screen()?.address).toEqual({
      screen: PROFILE,
      params: { personId: PERSON },
    });
    expect(lastText(s.messenger)).toBe(`Профиль ${PERSON}`);
    expect(labelsOf(lastLine(s.messenger).message)).toEqual([
      'Заметки',
      'Другой',
      'К списку',
      'Назад',
    ]);
    expect(screensOf(s.conversation)).toEqual([LIST]);
  });

  test('сигнал back — то же, что вариант', async () => {
    const run = async (by: 'press' | 'signal') => {
      const s = sceneOf({ messenger: editingMessenger() });
      await s.enter('start');
      await s.press('Пометить');
      await s.press('Профиль');
      const from = s.messenger.journal.length;
      if (by === 'press') await s.press('Назад');
      else await s.back();
      return { s, from };
    };

    const variant = await run('press');
    const signal = await run('signal');

    const screen = signal.s.conversation.screen();
    expect(screen?.address).toEqual(variant.s.conversation.screen()?.address);
    expect(screen?.state).toEqual(variant.s.conversation.screen()?.state);
    expect(screen).toMatchObject({ state: { filter: MARK } });
    expect(lastLine(signal.s.messenger).message.text).toEqual(
      lastLine(variant.s.messenger).message.text,
    );
    expect(labelsOf(lastLine(signal.s.messenger).message)).toEqual(
      labelsOf(lastLine(variant.s.messenger).message),
    );
    expect(signal.s.conversation.snapshot()).not.toHaveProperty('path');
    expect(opsOf(signal.s.messenger, signal.from)).toEqual([
      'retire m1',
      'show m2',
    ]);
  });

  test('проактивный показ при непустом пути — «Назад» остаётся', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Профиль');
    const from = s.messenger.journal.length;

    await s.refresh();

    expect(opsOf(s.messenger, from)).toEqual(['edit m1']);
    expect(labelsOf(lastLine(s.messenger).message)).toContain('Назад');
    expect(screensOf(s.conversation)).toEqual([LIST]);
  });

  test('экран снимка, вид которого с тех пор изменился, — «Назад» нового показа ведёт на экран из пути', async () => {
    const messenger = editingMessenger();
    const first = sceneOf({ messenger });
    await first.enter('start');
    await first.press('Пометить');
    await first.press('Профиль');
    const saved = first.conversation.snapshot();
    first.conversation.close();
    // После перезапуска представление профиля другое: отпечаток не совпадёт.
    const changed = views.over([
      ScreenPresenter.for(
        ProfileScreenDef,
        ({ data }) => `Профиль ${data?.personId ?? ''}, новый вид`,
      ),
    ]);
    const s = sceneOf({ messenger, snapshot: saved, views: changed });

    await s.conversation.receive({ ...head(), kind: 'cancel' });
    const shown = lastLine(messenger).message;
    await s.press('Назад');

    expect(textOf(shown)).toBe(`Профиль ${PERSON}, новый вид`);
    expect(labelsOf(shown)).toContain('Назад');
    expect(s.conversation.screen()).toMatchObject({
      address: { screen: LIST, params: { page: 0 } },
      state: { filter: MARK },
    });
    expect(s.conversation.snapshot()).not.toHaveProperty('path');
  });
});

describe('Conversation — когда путь меняется', () => {
  test('переход на тот же экран с другими параметрами путь не растит', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Дальше');
    const paged = labelsOf(lastLine(s.messenger).message);
    const pagedPath = screensOf(s.conversation);
    await s.press('Профиль');
    await s.press('Другой');
    const other = s.conversation.screen()?.address;
    const path = pathOf(s.conversation).map((step) => step.address);

    await s.press('Назад');

    expect(paged).toEqual(['Профиль', 'Дальше', 'Пометить']);
    expect(pagedPath).toEqual([]);
    expect(other).toEqual({ screen: PROFILE, params: { personId: OTHER } });
    expect(path).toEqual([{ screen: LIST, params: { page: 1 } }]);
    expect(s.conversation.screen()?.address).toEqual({
      screen: LIST,
      params: { page: 1 },
    });
  });

  test('переход на экран из пути — путь до него', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Пометить');
    await s.press('Профиль');
    await s.press('Заметки');
    const deep = screensOf(s.conversation);

    await s.press('К профилю');
    const cut = screensOf(s.conversation);
    const profile = labelsOf(lastLine(s.messenger).message);
    await s.press('К списку');

    expect(deep).toEqual([LIST, PROFILE]);
    expect(cut).toEqual([LIST]);
    expect(profile.at(-1)).toBe('Назад');
    // Список был в пути: путь пуст, список открыт заново — состояние начальное.
    expect(s.conversation.snapshot()).not.toHaveProperty('path');
    expect(s.conversation.screen()).toMatchObject({
      address: { screen: LIST, params: { page: 0 } },
      state: { filter: '' },
    });
    expect(labelsOf(lastLine(s.messenger).message)).not.toContain('Назад');
  });

  test('предел пути: сверх 16 давний забыт', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('hops');
    for (let i = 0; i < HOP_COUNT - 1; i += 1) await s.press('Вперёд');
    const path = screensOf(s.conversation);

    for (let i = 0; i < 16; i += 1) await s.press('Назад');

    expect(path).toEqual(Array.from({ length: 16 }, (_, i) => hopId(i + 1)));
    expect(s.conversation.screen()?.address.screen).toBe(hopId(1));
    expect(labelsOf(lastLine(s.messenger).message)).toEqual(['Вперёд']);
    expect(s.conversation.snapshot()).not.toHaveProperty('path');
  });

  test('элемент пути не восстановился — заметка «Прежний экран не восстановлен — начнём сначала.», вход home, путь сброшен', async () => {
    const messenger = editingMessenger();
    const first = sceneOf({ messenger });
    await first.enter('start');
    await first.press('Дальше');
    await first.press('Пометить');
    await first.press('Профиль');
    await first.press('Заметки');
    const saved = first.conversation.snapshot();
    first.conversation.close();
    const path = saved.path ?? [];
    // Верхний элемент — экран, которого в наборе больше нет; под ним — список с пометкой.
    const gone = {
      address: { screen: 'pathUi/people/gone', params: {} },
      state: {},
      revision: 1,
    };
    const second = sceneOf({
      messenger,
      snapshot: { ...saved, path: [...path.slice(0, -1), gone] },
    });

    await second.back();

    expect(path).toHaveLength(2);
    expect(textsOf(messenger).slice(-2)).toEqual([
      'Прежний экран не восстановлен — начнём сначала.',
      'Список: страница 0, людей 2, пометка «»',
    ]);
    // Следующий элемент (список с пометкой) не пробуется: вход home.
    expect(second.conversation.screen()).toMatchObject({
      address: { screen: LIST, params: { page: 0 } },
      state: { filter: '' },
    });
    expect(second.conversation.snapshot()).not.toHaveProperty('path');
    expect(labelsOf(placeOf(messenger))).not.toContain('Назад');
  });

  test('выход сторис и «В начало» сбрасывают путь', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Профиль');
    await s.press('Заметки');
    await s.press('Готово');
    const exited = {
      screen: s.conversation.screen()?.address.screen,
      labels: labelsOf(lastLine(s.messenger).message),
      path: screensOf(s.conversation),
    };
    s.world.broken = true;
    await s.press('Профиль');
    const refused = labelsOf(lastLine(s.messenger).message);
    const refusedPath = screensOf(s.conversation);

    await s.press('В начало');

    expect(exited).toEqual({
      screen: LIST,
      labels: ['Профиль', 'Дальше', 'Пометить'],
      path: [],
    });
    expect(refused).toEqual(['Повторить', 'Назад', 'В начало']);
    expect(refusedPath).toEqual([LIST]);
    expect(s.conversation.screen()?.address.screen).toBe(LIST);
    expect(labelsOf(lastLine(s.messenger).message)).toEqual([
      'Профиль',
      'Дальше',
      'Пометить',
    ]);
    expect(s.conversation.snapshot()).not.toHaveProperty('path');
  });

  test('«Повторить» вида в отказе — тот же экран, путь прежний', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Пометить');
    s.world.broken = true;
    await s.press('Профиль');
    s.world.broken = false;

    await s.press('Повторить');
    const retried = labelsOf(lastLine(s.messenger).message);
    const path = screensOf(s.conversation);
    await s.press('Назад');

    expect(retried).toEqual(['Заметки', 'Другой', 'К списку', 'Назад']);
    expect(path).toEqual([LIST]);
    expect(s.conversation.screen()).toMatchObject({
      address: { screen: LIST, params: { page: 0 } },
      state: { filter: MARK },
    });
  });
});

describe('Conversation — путь меняется только после успеха', () => {
  test('«Назад» на экран из пути, загрузка которого теперь отказывает, — вид в отказе, прежнего показа нет, экран не считается невосстановленным', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Профиль');
    await s.press('Заметки');
    const shown = textsOf(s.messenger).length;
    s.world.broken = true;

    await s.back();
    const fresh = textsOf(s.messenger).slice(shown);

    expect(s.conversation.screen()?.address).toEqual({
      screen: PROFILE,
      params: { personId: PERSON },
    });
    expect(labelsOf(lastLine(s.messenger).message)).toEqual([
      'Повторить',
      'Назад',
      'В начало',
    ]);
    expect(fresh.join('\n')).not.toContain(`Профиль ${PERSON}`);
    expect(textsOf(s.messenger)).not.toContain(
      'Прежний экран не восстановлен — начнём сначала.',
    );
    expect(screensOf(s.conversation)).toEqual([LIST]);
  });

  test('бросок порта при открытии перехода — путь в снимке прежний; после починки переход растит его один раз', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Пометить');
    await s.press('Профиль');
    const before = pathOf(s.conversation);
    s.port.broken = true;

    await expect(s.press('Заметки')).rejects.toThrow();
    const thrown = pathOf(s.conversation);
    s.port.broken = false;
    await s.press('Заметки');

    expect(before.map((step) => step.address.screen)).toEqual([LIST]);
    expect(thrown).toEqual(before);
    expect(screensOf(s.conversation)).toEqual([LIST, PROFILE]);
    expect(s.conversation.screen()?.address.screen).toBe(NOTES);
  });

  test('бросок порта при «Назад» — путь прежний, элемент не потерян: после починки «Назад» поднимает его', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Пометить');
    await s.press('Профиль');
    const before = pathOf(s.conversation);
    s.port.broken = true;

    await expect(s.back()).rejects.toThrow();
    const thrown = pathOf(s.conversation);
    const live = s.conversation.screen()?.address.screen;
    s.port.broken = false;
    await s.back();

    expect(before.map((step) => step.address.screen)).toEqual([LIST]);
    expect(thrown).toEqual(before);
    expect(live).toBe(PROFILE);
    expect(s.conversation.screen()).toMatchObject({
      address: { screen: LIST, params: { page: 0 } },
      state: { filter: MARK },
    });
    expect(s.conversation.snapshot()).not.toHaveProperty('path');
  });
});

describe('ConversationPath — предел элемента', () => {
  /** Снимок экземпляра экрана `screen`, чей JSON ровно `length` знаков. */
  const stepOf = (screen: string, length: number): InstanceJson => {
    const base = { address: { screen, params: {} }, state: { filter: '' } };
    const pad = length - JSON.stringify({ ...base, revision: 1 }).length;
    return { ...base, state: { filter: 'x'.repeat(pad) }, revision: 1 };
  };

  test('элемент длиннее предела в путь не кладётся — путь прежний; на пределе — кладётся', () => {
    const path = new ConversationPath();
    const list = stepOf(LIST, 128);
    path.leave(list, PROFILE);
    const long = stepOf(PROFILE, MAX_STEP_LENGTH + 1);
    const edge = stepOf(PROFILE, MAX_STEP_LENGTH);

    path.leave(long, NOTES);
    const after = path.toJSON();
    path.leave(edge, NOTES);

    expect(JSON.stringify(long)).toHaveLength(MAX_STEP_LENGTH + 1);
    expect(JSON.stringify(edge)).toHaveLength(MAX_STEP_LENGTH);
    expect(after).toEqual([list]);
    expect(path.toJSON()).toEqual([list, edge]);
  });

  test('длинный элемент не мешает правилам: тот же экран — путь прежний, экран из пути — обрезка', () => {
    const path = new ConversationPath();
    const list = stepOf(LIST, 128);
    path.leave(list, PROFILE);
    path.leave(stepOf(PROFILE, 128), NOTES);

    path.leave(stepOf(NOTES, MAX_STEP_LENGTH + 1), NOTES);
    const same = path.toJSON();
    path.leave(stepOf(NOTES, MAX_STEP_LENGTH + 1), PROFILE);

    expect(
      v.parse(v.array(Step), same).map((step) => step.address.screen),
    ).toEqual([LIST, PROFILE]);
    expect(path.toJSON()).toEqual([list]);
  });
});

describe('Conversation — «Назад» и закрытые экраны', () => {
  test('«Назад» старого экрана — «Эта кнопка устарела.»', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Профиль');
    const stale = refOf(s.messenger, 'Назад');
    await s.press('Заметки');
    const from = s.messenger.journal.length;

    const press = await s.pressRef(stale);

    expect(s.messenger.journal.slice(from)).toEqual([
      { op: 'answered', peer: PEER, press, text: 'Эта кнопка устарела.' },
    ]);
    expect(s.conversation.screen()?.address.screen).toBe(NOTES);
    expect(screensOf(s.conversation)).toEqual([LIST, PROFILE]);
  });

  test('после «Назад» у экрана новый номер: ссылки его прежнего показа — «Эта кнопка устарела.»', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    const mark = refOf(s.messenger, 'Пометить');
    const serial = s.conversation.snapshot().screen?.serial ?? 0;
    await s.press('Профиль');
    await s.press('Назад');
    const restored = s.conversation.snapshot().screen?.serial ?? 0;
    const from = s.messenger.journal.length;

    const press = await s.pressRef(mark);

    expect(restored).toBeGreaterThan(serial);
    expect(s.messenger.journal.slice(from)).toEqual([
      { op: 'answered', peer: PEER, press, text: 'Эта кнопка устарела.' },
    ]);
    expect(s.conversation.screen()).toMatchObject({
      address: { screen: LIST },
      state: { filter: '' },
    });
  });

  test('back сбрасывает черновик', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');
    await s.press('Профиль');
    await s.press('Заметки');
    await s.press('Добавить');
    const asked = lastText(s.messenger);
    const from = s.messenger.journal.length;

    await s.back();
    const draft = s.conversation.snapshot().draft;
    const ops = opsOf(s.messenger, from);
    await s.text('Хлеб');

    expect(asked).toBe('Введите: Текст');
    expect(draft).toBeUndefined();
    // Сброс черновика — без заметки: профиль новым сообщением (у вопроса
    // текстом вариантов нет — уходить месту нечем).
    expect(ops).toEqual(['show m2']);
    expect(s.conversation.screen()?.address.screen).toBe(PROFILE);
    expect(s.world.calls).toEqual([]);
  });

  test('back при пустом пути — живой экран снова, без заметки: черновик сброшен, экземпляр прежний, место с вариантами уходит', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('notes');
    const before = s.conversation.screen();
    const opened = s.kit.observer.records.filter((r) => r.kind === 'opened');
    await s.press('Добавить');
    const from = s.messenger.journal.length;

    await s.back();
    const draft = s.conversation.snapshot().draft;
    const ops = opsOf(s.messenger, from);
    const again = s.messenger.journal.length;
    await s.back();
    const repeated = opsOf(s.messenger, again);
    const texts = textsOf(s.messenger);
    const after = s.conversation.screen();
    await s.text('Хлеб');

    expect(draft).toBeUndefined();
    // У вопроса текстом вариантов нет — уходить месту нечем.
    expect(ops).toEqual(['show m2']);
    expect(repeated).toEqual(['retire m2', 'show m3']);
    expect(texts.slice(1)).toEqual(['Заметки', 'Заметки']);
    // Экземпляр не открывался заново: тот же снимок, записей открытия не прибавилось.
    expect(after).toEqual(before);
    expect(s.kit.observer.records.filter((r) => r.kind === 'opened')).toEqual(
      opened,
    );
    expect(s.world.calls).toEqual([]);
  });
});

describe('Conversations — путь в снимке', () => {
  test('путь переживает перезапуск', async () => {
    const bus = new AwaitingBus();
    const example = new ExampleApp(
      { mode: 'test', dataDir: tmp().path, users: [A] },
      { bus, logger: new MemoryLogger(), clock: () => T0 },
    );
    const server = new UiServer({
      set: PathSetDef,
      dispatch: new ApiAppDispatch(example.api),
      context: { bus, logger: new MemoryLogger() },
    });
    const world = worldOf();
    const store = new MemoryConversationStore();
    const messenger = editingMessenger();
    const nodeOf = () =>
      new Conversations({
        app: PathAppDef,
        codes: codesOf(world),
        server,
        views,
        observer: new MemoryUiObserver(),
        messenger,
        store,
        logger: new MemoryLogger(),
        people: async () => A,
        peers: async () => undefined,
        callers: example.callers,
        places: {
          place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
        },
      });
    const press = (node: ReturnType<typeof nodeOf>, label: string) =>
      node.receive({
        ...head(),
        kind: 'press',
        ref: refOf(messenger, label),
        press: `press-${label}`,
      });
    const first = nodeOf();
    await first.receive({ ...head(), kind: 'enter', entry: 'start' });
    await press(first, 'Пометить');
    await press(first, 'Профиль');
    await first.close();
    const saved = v.parse(ConversationSnapshotSchema, await store.load(PEER));

    // После перезапуска вид профиля не изменился: его варианты, «Назад» в
    // том числе, — прежние, действие исполняется сразу.
    const second = nodeOf();
    await press(second, 'Другой');
    const other = v.parse(ConversationSnapshotSchema, await store.load(PEER));
    await second.receive(backSignal());
    const after = v.parse(ConversationSnapshotSchema, await store.load(PEER));

    expect(saved.path).toEqual([
      {
        address: { screen: LIST, params: { page: 0 } },
        state: { filter: MARK },
        revision: expect.any(Number),
      },
    ]);
    expect(other.screen?.instance).toMatchObject({
      address: { screen: PROFILE, params: { personId: OTHER } },
    });
    expect(other.path).toEqual(saved.path);
    expect(after.screen?.instance).toMatchObject({
      address: { screen: LIST, params: { page: 0 } },
      state: { filter: MARK },
    });
    expect(after).not.toHaveProperty('path');
    expect(lastText(messenger)).toBe(
      `Список: страница 0, людей 2, пометка «${MARK}»`,
    );
  });
});
