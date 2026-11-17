import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result, Trace } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp, ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type AnyScreenDef,
  CodeLoader,
  CodeLoaders,
  type DataOf,
  type FieldChoices,
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
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { RuntimeKit, T0, testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import {
  ExampleDialogAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogTraces } from '../dialog/dialog-traces';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import type {
  Delivery,
  MessageHandle,
  SendOptions,
  Updated,
} from '../messenger/messenger.types';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import { MAX_FRAGMENT_TEXT } from './conversation.const';
import type { ConversationSnapshot } from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';
import { Conversations } from './conversations';
import { MemoryConversationStore } from './memory-conversation-store';

// Показ беседы в живое место: на месте (`update`) или новым (`show`) по
// положению, уход прежнего места (`retire` с последним сообщением и ссылкой
// нажатого), экран из нескольких сообщений, проактивный показ, место в
// снимке, след в истории по ключу и перекрытие представлений под
// мессенджер. Исходы ядра по строкам — `conversation-outcomes.test.ts`.
// Проверки — по `MemoryMessenger.chat` и журналу; беседа — на исполнителе
// с заглушками и локальными Def.

const A = testUuid(1);
const PEER = 'peer-a';
const LESSON = 'урок-mark-k5-';
const tmp = useTempDir('dmg-ui-conversation-show-');

/** Данные экранов сцены: тест меняет их между сигналами, код читает при загрузке и пишет вызовы. */
type World = {
  count: number;
  parts: number;
  step: number;
  readonly calls: string[];
};

const worldOf = (): World => ({ count: 2, parts: 2, step: 1, calls: [] });

/** Экран после перехода: текст без вариантов. */
const OtherScreenDef = ScreenDef.define({
  name: 'other',
  label: 'Другой',
  description: 'Экран после перехода, без вариантов.',
  reads: [],
  data: v.object({}),
});

/** Главный: действие, остающееся на экране, переход и локальное действие. */
const MainScreenDef = ScreenDef.define({
  name: 'main',
  label: 'Главная',
  description: 'Действие на месте, переход и локальное действие.',
  reads: [],
  data: v.object({ count: v.pipe(v.number(), v.description('Число')) }),
  state: v.strictObject({
    ticks: v.pipe(v.number(), v.description('Число отметок')),
  }),
  actions: {
    save: { label: 'Сохранить', description: 'Остаётся на экране.' },
    leave: {
      label: 'Дальше',
      description: 'Переход на другой экран.',
      to: (): readonly AnyScreenDef[] => [OtherScreenDef],
    },
  },
  locals: {
    tick: { label: 'Отметить', description: 'Прибавляет отметку.' },
  },
});

const COLORS = ['red', 'blue'] as const;

/** Форма: текст основному действию, поле с вариантами, подтверждение. */
const FormScreenDef = ScreenDef.define({
  name: 'form',
  label: 'Форма',
  description: 'Основное действие с полем, поле с вариантами, подтверждение.',
  reads: [],
  data: v.object({}),
  actions: {
    rename: {
      label: 'Переименовать',
      description: 'Поле названия; основное действие.',
      input: v.object({
        title: v.pipe(v.string(), v.description('Название')),
      }),
    },
    pick: {
      label: 'Выбрать',
      description: 'Поле с вариантами.',
      input: v.object({
        color: v.pipe(v.picklist(COLORS), v.description('Цвет')),
      }),
    },
    drop: {
      label: 'Удалить',
      description: 'Действие с подтверждением.',
      confirm: { label: 'Удалить всё?', description: 'Вернуть нельзя.' },
    },
  },
  primary: 'rename',
});

/** Вид из нескольких сообщений: число частей — в данных. */
const MultiScreenDef = ScreenDef.define({
  name: 'multi',
  label: 'Части',
  description: 'Вид из нескольких сообщений.',
  reads: [],
  data: v.object({ parts: v.pipe(v.number(), v.description('Число частей')) }),
  actions: {
    grow: { label: 'Больше', description: 'Прибавляет часть.' },
    keep: { label: 'Так же', description: 'Части прежние.' },
  },
});

/** Шаг со следом в истории: ключ — из данных, в тексте вида его нет. */
const StepScreenDef = ScreenDef.define({
  name: 'step',
  label: 'Шаг',
  description: 'Шаг со следом в истории по ключу из данных.',
  reads: [],
  data: v.object({ step: v.pipe(v.number(), v.description('Номер шага')) }),
  actions: {
    next: { label: 'Следующий', description: 'Следующий шаг: ключ другой.' },
    again: { label: 'Ещё раз', description: 'Тот же шаг: ключ прежний.' },
    leave: {
      label: 'Дальше',
      description: 'Переход на другой экран.',
      to: (): readonly AnyScreenDef[] => [OtherScreenDef],
    },
  },
});

/** Страница со следом в истории по адресу. */
const PageScreenDef = ScreenDef.define({
  name: 'page',
  label: 'Страница',
  description: 'След в истории по адресу экрана.',
  params: v.strictObject({
    n: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.description('Номер страницы'),
    ),
  }),
  reads: [],
  data: v.object({ n: v.pipe(v.number(), v.description('Номер страницы')) }),
  actions: {
    again: { label: 'Ещё раз', description: 'Тот же адрес.' },
    turn: { label: 'Листать', description: 'Следующая страница.' },
  },
});

type Main = typeof MainScreenDef;

class MainCode extends ScreenCode<Main> {
  override readonly locals = {
    tick: (state: StateOf<Main>): StateOf<Main> => ({
      ticks: state.ticks + 1,
    }),
  };

  override readonly actions: Partial<ActionSteps<Main>> = {
    save: {
      done: () => {
        this.world.calls.push('save');
        return MainScreenDef.at({});
      },
    },
    leave: { done: () => OtherScreenDef.at({}) },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<Result<DataOf<Main>, DomainError>> {
    return ok({ count: this.world.count });
  }

  override initialState(): StateOf<Main> {
    return { ticks: 0 };
  }
}

class OtherCode extends ScreenCode<typeof OtherScreenDef> {
  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class FormCode extends ScreenCode<typeof FormScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof FormScreenDef>> = {
    rename: {
      done: ({ input }) => {
        this.world.calls.push(`rename:${input.title}`);
        return FormScreenDef.at({});
      },
    },
    pick: {
      done: ({ input }) => {
        this.world.calls.push(`pick:${input.color}`);
        return FormScreenDef.at({});
      },
    },
    drop: {
      done: () => {
        this.world.calls.push('drop');
        return FormScreenDef.at({});
      },
    },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override choices(name: string): FieldChoices {
    if (name !== 'pick') return {};
    return {
      color: [
        { value: 'red', label: 'Красный' },
        { value: 'blue', label: 'Синий' },
      ],
    };
  }
}

class MultiCode extends ScreenCode<typeof MultiScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof MultiScreenDef>> = {
    grow: {
      done: () => {
        this.world.parts += 1;
        return MultiScreenDef.at({});
      },
    },
    keep: { done: () => MultiScreenDef.at({}) },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<
    Result<DataOf<typeof MultiScreenDef>, DomainError>
  > {
    return ok({ parts: this.world.parts });
  }
}

class StepCode extends ScreenCode<typeof StepScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof StepScreenDef>> = {
    next: {
      done: () => {
        this.world.step += 1;
        return StepScreenDef.at({});
      },
    },
    again: { done: () => StepScreenDef.at({}) },
    leave: { done: () => OtherScreenDef.at({}) },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<
    Result<DataOf<typeof StepScreenDef>, DomainError>
  > {
    return ok({ step: this.world.step });
  }
}

class PageCode extends ScreenCode<typeof PageScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof PageScreenDef>> = {
    again: { done: ({ params }) => PageScreenDef.at(params) },
    turn: { done: ({ params }) => PageScreenDef.at({ n: params.n + 1 }) },
  };

  override async load({
    params,
  }: LoadContext<typeof PageScreenDef>): Promise<
    Result<DataOf<typeof PageScreenDef>, DomainError>
  > {
    return ok({ n: params.n });
  }
}

const ShowSetDef = UiSetDef.define({
  name: 'showUi',
  label: 'Набор показа',
  description: 'Локальные экраны политик показа беседы.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'show',
      label: 'Показ',
      description: 'Главный, другой, форма, части, шаг и страница.',
      screens: [
        MainScreenDef,
        OtherScreenDef,
        FormScreenDef,
        MultiScreenDef,
        StepScreenDef,
        PageScreenDef,
      ],
      stories: [],
    }),
  ],
});

const ShowAppDef = UiAppDef.define({
  name: 'showDialog',
  label: 'Показ',
  description: 'Приложение UI локальных экранов политик показа.',
  set: ShowSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Главная',
      description: 'Главный экран.',
      address: MainScreenDef.at({}),
    },
    form: {
      label: 'Форма',
      description: 'Форма.',
      address: FormScreenDef.at({}),
    },
    multi: {
      label: 'Части',
      description: 'Вид из нескольких сообщений.',
      address: MultiScreenDef.at({}),
    },
    step: {
      label: 'Шаг',
      description: 'Шаг со следом.',
      address: StepScreenDef.at({}),
    },
    page: {
      label: 'Страница',
      description: 'Страница со следом по адресу.',
      address: PageScreenDef.at({ n: 0 }),
    },
  },
});

const views = ChatViews.of(ShowSetDef, [
  ScreenPresenter.for(
    MainScreenDef,
    ({ data, state }) =>
      `Главная: ${data?.count ?? 0}, отметок ${state?.ticks ?? 0}`,
  ),
  ScreenPresenter.for(OtherScreenDef, () => 'Другой экран'),
  ScreenPresenter.for(FormScreenDef, () => 'Форма'),
  ScreenPresenter.of(MultiScreenDef, {
    render: (view, kit) => {
      const parts = view.data?.parts ?? 1;
      return Array.from({ length: parts }, (_, i) =>
        kit.message(
          `Часть ${i + 1} из ${parts}`,
          i === parts - 1 ? kit.options : [],
        ),
      );
    },
  }),
  ScreenPresenter.of(StepScreenDef, {
    render: (view, kit) => kit.message(`Шаг ${view.data?.step ?? 0}`),
    history: (view) => `${LESSON}${view.data?.step ?? 0}`,
  }),
  ScreenPresenter.of(PageScreenDef, {
    render: (view, kit) => kit.message(`Страница ${view.data?.n ?? 0}`),
    history: 'address',
  }),
]);

/** Мессенджер, который помнит признак инициативы показов и правок и тексты ответов на нажатие. */
class RecordingMessenger extends MemoryMessenger {
  readonly sends: {
    readonly op: 'show' | 'update';
    readonly initiative: boolean;
  }[] = [];

  override async show(
    peer: string,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<MessageHandle>> {
    this.sends.push({ op: 'show', initiative: send?.initiative === true });
    return super.show(peer, message, send);
  }

  override async update(
    peer: string,
    handle: MessageHandle,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<Updated>> {
    this.sends.push({ op: 'update', initiative: send?.initiative === true });
    return super.update(peer, handle, message, send);
  }
}

/** Мессенджер с правкой, у которого правка не удаётся: `update` всегда даёт новое сообщение. */
class StubbornMessenger extends MemoryMessenger {
  readonly updated: MessageHandle[] = [];

  override async update(
    peer: string,
    handle: MessageHandle,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<Updated>> {
    this.updated.push(handle);
    return super.update(peer, `gone-${handle}`, message, send);
  }
}

const editingMessenger = () =>
  new RecordingMessenger({
    capabilities: MemoryMessenger.editing().capabilities,
  });

const windowedMessenger = () =>
  new RecordingMessenger({
    capabilities: MemoryMessenger.windowed(() => T0).capabilities,
    clock: () => T0,
  });

const MESSENGERS = [
  ['editing', editingMessenger],
  ['windowed', windowedMessenger],
] as const;

// id сигналов, запросов и эпох — сквозные на файл: беседа из снимка не
// получает id, уже отсеянный прежним воплощением.
let signals = 0;
let requests = 0;
let epochs = 0;

const refreshSignal = (eventId: string): RefreshSignal => ({
  event: 'taskCreated',
  eventId,
  trace: Trace.fromEvent({ eventId, correlationId: eventId }).toJSON(),
});

const textOf = (message: Message) => PlainText.of(message.text);

/** Ссылка варианта `label` из самого свежего сообщения беседы, где он есть. */
const refOf = (messenger: MemoryMessenger, label: string): string => {
  for (const line of [...messenger.chat(PEER)].reverse()) {
    const option = line.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

/** Операции журнала с `from` до `to` — коротко: вид, handle, нажатый, текст ответа. */
const opsOf = (messenger: MemoryMessenger, from = 0, to?: number): string[] =>
  messenger.journal.slice(from, to).map((entry) => {
    switch (entry.op) {
      case 'sent':
        return `${entry.via} ${entry.handle}`;
      case 'edited':
        return `edit ${entry.handle}`;
      case 'retired':
        return entry.chosen === undefined
          ? `retire ${entry.handle}`
          : `retire ${entry.handle} ← ${entry.chosen}`;
      case 'answered':
        return entry.text === undefined ? 'answer' : `answer «${entry.text}»`;
      case 'undelivered':
        return `undelivered ${entry.via} ${entry.reason}`;
      case 'community':
        return `community ${entry.operation}`;
      default: {
        const unknown: never = entry;
        throw new Error(`неизвестная запись ${String(unknown)}`);
      }
    }
  });

const textsOf = (messenger: MemoryMessenger) =>
  messenger.chat(PEER).map((line) => textOf(line.message));

/** Сообщение беседы по номеру; с конца — отрицательный. */
const lineAt = (messenger: MemoryMessenger, index: number) => {
  const line = messenger.chat(PEER).at(index);
  if (line === undefined) throw new Error(`нет сообщения ${index}`);
  return line;
};

const lastLine = (messenger: MemoryMessenger) => lineAt(messenger, -1);

const sha256 = async (text: string): Promise<string> => {
  const bytes = new TextEncoder().encode(text);
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
};

/** Беседа на исполнителе с заглушками; `snapshot` — беседа после перезапуска на том же мессенджере. */
const sceneOf = <M extends MemoryMessenger>(options: {
  readonly messenger: M;
  readonly snapshot?: ConversationSnapshot;
  readonly world?: World;
}) => {
  const world = options.world ?? worldOf();
  const { messenger } = options;
  const kit = new RuntimeKit(
    CodeLoaders.of(ShowSetDef, [
      CodeLoader.screen(MainScreenDef, async () => new MainCode(world)),
      CodeLoader.screen(OtherScreenDef, async () => new OtherCode()),
      CodeLoader.screen(FormScreenDef, async () => new FormCode(world)),
      CodeLoader.screen(MultiScreenDef, async () => new MultiCode(world)),
      CodeLoader.screen(StepScreenDef, async () => new StepCode(world)),
      CodeLoader.screen(PageScreenDef, async () => new PageCode()),
    ]),
    ShowSetDef,
  );
  const conversation = new Conversation(
    {
      app: ShowAppDef,
      runtime: kit.runtime,
      contexts: { context: async () => testRenderContext },
      traces: new DialogTraces(() => {
        requests += 1;
        return `r-${requests}`;
      }),
      views,
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
  const head = () => {
    signals += 1;
    return { id: `s-${signals}`, peer: PEER, sender: 'sender-a' };
  };
  const pressRef = async (ref: string): Promise<void> => {
    const at = head();
    await conversation.receive({
      ...at,
      kind: 'press',
      ref,
      press: `p-${at.id}`,
    });
  };
  return {
    kit,
    world,
    messenger,
    conversation,
    enter: async (entry: string) => {
      await conversation.receive({ ...head(), kind: 'enter', entry });
    },
    text: async (text: string) => {
      await conversation.receive({ ...head(), kind: 'text', text });
    },
    cancel: async () => {
      await conversation.receive({ ...head(), kind: 'cancel' });
    },
    attach: async () => {
      await conversation.receive({
        ...head(),
        kind: 'attachment',
        attachment: { kind: 'file', handle: 'h-1' },
      });
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

describe.each(MESSENGERS)(
  'Conversation — положение живого места (%s)',
  (name, make) => {
    const editing = name === 'editing';

    test('нажатие на живом экране, который последний, — правка на месте, и при переходе на другой экран тоже', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      const from = s.messenger.journal.length;

      await s.press('Сохранить');
      await s.press('Отметить');
      await s.press('Дальше');

      expect(s.world.calls).toEqual(['save']);
      expect(s.conversation.screen()?.address.screen).toBe('showUi/show/other');
      expect(s.messenger.sends.slice(1)).toEqual([
        { op: 'update', initiative: false },
        { op: 'update', initiative: false },
        { op: 'update', initiative: false },
      ]);
      if (editing) {
        expect(opsOf(s.messenger, from)).toEqual([
          'edit m1',
          'answer',
          'edit m1',
          'answer',
          'edit m1',
          'answer',
        ]);
        expect(s.messenger.chat(PEER)).toMatchObject([
          { handle: 'm1', edits: 3, retired: false },
        ]);
      } else {
        expect(opsOf(s.messenger, from)).toEqual([
          'update m2',
          'update m3',
          'update m4',
        ]);
        expect(textsOf(s.messenger)).toEqual([
          'Главная: 2, отметок 0',
          'Главная: 2, отметок 0',
          'Главная: 2, отметок 1',
          'Другой экран',
        ]);
      }
      expect(textOf(lastLine(s.messenger).message)).toBe('Другой экран');
    });

    test('после текста собеседника — новое сообщение, прежнее место — retire', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('form');
      const from = s.messenger.journal.length;

      await s.text('Хлеб');

      expect(s.world.calls).toEqual(['rename:Хлеб']);
      expect(opsOf(s.messenger, from)).toEqual(
        editing ? ['retire m1', 'show m2'] : ['show m2'],
      );
      expect(textsOf(s.messenger)).toEqual(['Форма', 'Форма']);
    });

    test('после заметки беседы — новое сообщение; уход места — с нажатым вариантом', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      const save = refOf(s.messenger, 'Сохранить');
      await s.attach();
      const from = s.messenger.journal.length;

      await s.pressRef(save);

      expect(textsOf(s.messenger)).toEqual([
        'Главная: 2, отметок 0',
        'Вложения здесь не принимаются.',
        'Главная: 2, отметок 0',
      ]);
      expect(opsOf(s.messenger, from)).toEqual(
        editing ? [`retire m1 ← ${save}`, 'show m3', 'answer'] : ['show m3'],
      );
    });

    test('сигналы cancel и enter — новое сообщение, прежнее место — retire', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');

      await s.cancel();
      await s.enter('start');

      expect(opsOf(s.messenger)).toEqual(
        editing
          ? ['show m1', 'retire m1', 'show m2', 'retire m2', 'show m3']
          : ['show m1', 'show m2', 'show m3'],
      );
    });

    test('вопрос поля с вариантами — в живом месте: вопрос и ответ на него правят место на месте', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('form');

      await s.press('Выбрать');
      await s.press('Красный');

      expect(s.world.calls).toEqual(['pick:red']);
      if (editing) {
        expect(s.messenger.chat(PEER)).toMatchObject([
          { handle: 'm1', edits: 2, retired: false },
        ]);
        expect(
          opsOf(s.messenger).filter((op) => op.startsWith('retire')),
        ).toEqual([]);
      } else {
        expect(textsOf(s.messenger)).toEqual([
          'Форма',
          'Выберите: Цвет',
          'Форма',
        ]);
        expect(opsOf(s.messenger).slice(1)).toEqual(['update m2', 'update m3']);
      }
      expect(textOf(lastLine(s.messenger).message)).toBe('Форма');
    });

    test('экран из нескольких сообщений: число совпало — правка каждого на месте; изменилось — новые, прежнее последнее — retire', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('multi');
      const shown = s.messenger.chat(PEER);
      const keepFrom = s.messenger.journal.length;

      await s.press('Так же');
      const growFrom = s.messenger.journal.length;
      const grow = refOf(s.messenger, 'Больше');
      await s.press('Больше');

      expect(shown.map((line) => textOf(line.message))).toEqual([
        'Часть 1 из 2',
        'Часть 2 из 2',
      ]);
      expect(shown.map((line) => line.message.options.length)).toEqual([0, 2]);
      if (editing) {
        expect(opsOf(s.messenger, keepFrom, growFrom)).toEqual([
          'edit m1',
          'edit m2',
          'answer',
        ]);
        expect(opsOf(s.messenger, growFrom)).toEqual([
          `retire m2 ← ${grow}`,
          'show m3',
          'show m4',
          'show m5',
          'answer',
        ]);
      } else {
        // Мессенджер без правки на `update` шлёт новое: остальные части — `show`.
        expect(opsOf(s.messenger, keepFrom, growFrom)).toEqual([
          'update m3',
          'show m4',
        ]);
        expect(opsOf(s.messenger, growFrom)).toEqual([
          'show m5',
          'show m6',
          'show m7',
        ]);
      }
      const last = s.messenger.chat(PEER).slice(-3);
      expect(last.map((line) => textOf(line.message))).toEqual([
        'Часть 1 из 3',
        'Часть 2 из 3',
        'Часть 3 из 3',
      ]);
      expect(last.map((line) => line.message.options.length)).toEqual([
        0, 0, 2,
      ]);
    });
  },
);

describe('Conversation — уход места и правка, которая не удалась', () => {
  test('retire прежнего места — его последнее сообщение как показано, со ссылками; нажат вариант не этого сообщения — без chosen', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('form');
    await s.press('Удалить');
    const yes = refOf(s.messenger, 'Да');
    await s.press('Нет');
    await s.attach();
    const place = lineAt(s.messenger, 0);
    const from = s.messenger.journal.length;

    await s.pressRef(yes);

    expect(s.world.calls).toEqual(['drop']);
    expect(textOf(place.message)).toBe('Форма');
    expect(place.message.options.map((o) => o.label)).toEqual([
      'Переименовать',
      'Выбрать',
      'Удалить',
    ]);
    expect(s.messenger.journal.slice(from, from + 1)).toStrictEqual([
      { op: 'retired', peer: PEER, handle: 'm1', message: place.message },
    ]);
    expect(opsOf(s.messenger, from)).toEqual([
      'retire m1',
      'show m3',
      'answer',
    ]);
  });

  test('update не правит (edited: false) — остальные части новыми, прежнее последнее — retire', async () => {
    const messenger = new StubbornMessenger({
      capabilities: MemoryMessenger.editing().capabilities,
    });
    const s = sceneOf({ messenger });
    await s.enter('multi');
    const keep = refOf(messenger, 'Так же');
    const from = messenger.journal.length;

    await s.pressRef(keep);

    expect(messenger.updated).toEqual(['m1']);
    expect(opsOf(messenger, from)).toEqual([
      'update m3',
      `retire m2 ← ${keep}`,
      'show m4',
      'answer',
    ]);
    expect(s.conversation.snapshot().screen?.handles).toEqual(['m3', 'm4']);
  });

  test('показ новыми ничего не доставил — место прежнее: следующий показ правит его на месте и возвращает варианты', async () => {
    let now = T0;
    // Мессенджер с правкой и окном инициативы: проактивный показ вне окна не доходит.
    const messenger = new RecordingMessenger({
      capabilities: {
        ...MemoryMessenger.editing().capabilities,
        initiative: { kind: 'window', ms: 1000 },
      },
      clock: () => now,
    });
    const s = sceneOf({ messenger });
    await s.enter('multi');
    const place = s.conversation.snapshot().screen;

    now = T0 + 2000;
    s.world.parts = 3;
    await s.refresh();
    const kept = s.conversation.snapshot().screen;
    const from = messenger.journal.length;
    messenger.heard(PEER);
    s.world.parts = 2;
    await s.refresh();

    expect(opsOf(messenger, 2, from)).toEqual([
      'retire m2',
      'undelivered show window',
      'undelivered show window',
      'undelivered show window',
    ]);
    expect(kept).toMatchObject({
      handles: ['m1', 'm2'],
      latest: true,
      message: place?.message,
    });
    expect(opsOf(messenger, from)).toEqual(['edit m1', 'edit m2']);
    expect(lineAt(messenger, 1)).toMatchObject({ handle: 'm2', retired: true });
    expect(lineAt(messenger, 1).message.options).toHaveLength(2);
    expect(s.conversation.snapshot().screen?.handles).toEqual(['m1', 'm2']);
  });
});

describe('Conversation — проактивный показ и перезапуск', () => {
  test('проактивный показ: место последнее — правка на месте с initiative; не последнее — новое с initiative', async () => {
    const s = sceneOf({ messenger: editingMessenger() });
    await s.enter('start');

    s.world.count = 5;
    await s.refresh();
    await s.attach();
    s.world.count = 7;
    await s.refresh();

    expect(s.messenger.sends).toEqual([
      { op: 'show', initiative: false },
      { op: 'update', initiative: true },
      { op: 'show', initiative: false },
      { op: 'show', initiative: true },
    ]);
    expect(opsOf(s.messenger)).toEqual([
      'show m1',
      'edit m1',
      'show m2',
      'retire m1',
      'show m3',
    ]);
    expect(textsOf(s.messenger)).toEqual([
      'Главная: 5, отметок 0',
      'Вложения здесь не принимаются.',
      'Главная: 7, отметок 0',
    ]);
  });

  test('положение переживает перезапуск: тот же мессенджер, новая беседа из снимка — нажатие правит прежнее сообщение на месте', async () => {
    const messenger = editingMessenger();
    const world = worldOf();
    const first = sceneOf({ messenger, world });
    await first.enter('start');
    const save = refOf(messenger, 'Сохранить');
    const place = lineAt(messenger, 0).message;
    const saved = v.parse(
      ConversationSnapshotSchema,
      JSON.parse(JSON.stringify(first.conversation.snapshot())),
    );
    first.conversation.close();

    const second = sceneOf({ messenger, world, snapshot: saved });
    const from = messenger.journal.length;
    await second.pressRef(save);

    expect(saved.screen).toMatchObject({
      handles: ['m1'],
      latest: true,
      message: place,
    });
    expect(saved.screen?.history).toBeUndefined();
    expect(world.calls).toEqual(['save']);
    expect(opsOf(messenger, from)).toEqual(['edit m1', 'answer']);
  });
});

describe('Conversation — мессенджер без правки', () => {
  test('у мессенджера без правки всегда новое: журнал без edited, ушедшие не отмечены', async () => {
    const s = sceneOf({ messenger: windowedMessenger() });
    await s.enter('form');

    await s.press('Выбрать');
    await s.press('Синий');
    await s.text('Хлеб');
    await s.press('Удалить');
    await s.press('Да');
    await s.refresh();

    const ops = opsOf(s.messenger);
    expect(ops.filter((op) => op.startsWith('edit'))).toEqual([]);
    const lines = s.messenger.chat(PEER);
    expect(lines).toHaveLength(ops.length);
    expect(new Set(lines.map((line) => line.handle)).size).toBe(lines.length);
    for (const line of lines) {
      expect(line).toMatchObject({ edits: 0, retired: false });
    }
    expect(s.world.calls).toEqual(['pick:blue', 'rename:Хлеб', 'drop']);
  });
});

describe.each(MESSENGERS)(
  'Conversation — след в истории (%s)',
  (name, make) => {
    const editing = name === 'editing';

    test('смена ключа — прежнее сообщение остаётся (retire с chosen), новое — show', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('step');
      const next = refOf(s.messenger, 'Следующий');
      const from = s.messenger.journal.length;

      await s.pressRef(next);

      expect(opsOf(s.messenger, from)).toEqual(
        editing ? [`retire m1 ← ${next}`, 'show m2', 'answer'] : ['show m2'],
      );
      expect(textsOf(s.messenger)).toEqual(['Шаг 1', 'Шаг 2']);
      expect(s.messenger.chat(PEER)[0]).toMatchObject({ edits: 0 });
    });

    test('тот же ключ — правка на месте; у мессенджера без правки — новое', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('step');
      const from = s.messenger.journal.length;

      await s.press('Ещё раз');

      expect(opsOf(s.messenger, from)).toEqual(
        editing ? ['edit m1', 'answer'] : ['update m2'],
      );
    });

    test('уход с экрана со следом — прежнее остаётся, следующий экран новым, хотя место последнее', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('step');
      const leave = refOf(s.messenger, 'Дальше');
      const from = s.messenger.journal.length;

      await s.pressRef(leave);

      expect(opsOf(s.messenger, from)).toEqual(
        editing ? [`retire m1 ← ${leave}`, 'show m2', 'answer'] : ['show m2'],
      );
      expect(textsOf(s.messenger)).toEqual(['Шаг 1', 'Другой экран']);
      expect(s.conversation.snapshot().screen?.history).toBeUndefined();
    });

    test('ключ по умолчанию — адрес экрана: тот же адрес — на месте, другой — новым', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('page');
      const again = s.messenger.journal.length;
      await s.press('Ещё раз');
      const key = await sha256(
        JSON.stringify(s.conversation.screen()?.address),
      );
      const history = s.conversation.snapshot().screen?.history;
      const turn = refOf(s.messenger, 'Листать');
      const from = s.messenger.journal.length;

      await s.pressRef(turn);

      expect(history).toBe(key);
      expect(opsOf(s.messenger, again, from)).toEqual(
        editing ? ['edit m1', 'answer'] : ['update m2'],
      );
      expect(opsOf(s.messenger, from)).toEqual(
        editing ? [`retire m1 ← ${turn}`, 'show m2', 'answer'] : ['show m3'],
      );
      expect(textOf(lastLine(s.messenger).message)).toBe('Страница 1');
    });

    test('тот же ключ, место не последнее — новое сообщение, прежнее — retire', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('step');
      const again = refOf(s.messenger, 'Ещё раз');
      await s.attach();
      const from = s.messenger.journal.length;

      await s.pressRef(again);

      expect(opsOf(s.messenger, from)).toEqual(
        editing ? [`retire m1 ← ${again}`, 'show m3', 'answer'] : ['show m3'],
      );
      expect(textsOf(s.messenger)).toEqual([
        'Шаг 1',
        'Вложения здесь не принимаются.',
        'Шаг 1',
      ]);
    });

    test('в снимке — хэш ключа, а не значение', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('step');

      const snapshot = s.conversation.snapshot();

      expect(snapshot.screen?.history).toBe(await sha256(`${LESSON}1`));
      expect(snapshot.screen?.history).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(snapshot)).not.toContain('mark-k5');
    });
  },
);

describe('Conversation — перекрытие представлений под мессенджер', () => {
  test('перекрытие под мессенджер: два узла на одном наборе — с over своё представление, без — общее', async () => {
    const bus = new AwaitingBus();
    const example = new ExampleApp(
      { mode: 'test', dataDir: tmp().path, users: [A] },
      { bus, logger: new MemoryLogger(), clock: () => T0 },
    );
    const server = new UiServer({
      set: ExampleUiSetDef,
      dispatch: new ApiAppDispatch(example.api),
      context: { bus, logger: new MemoryLogger() },
    });
    const own = exampleDialogViews.over([
      ScreenPresenter.of(TaskListScreenDef, {
        render: (view, kit) =>
          kit.message(`Список мессенджера: ${view.data?.tasks.length ?? 0}`),
      }),
    ]);
    const nodeOf = (registry: ChatViews) => {
      const messenger = MemoryMessenger.editing();
      const conversations = new Conversations({
        app: ExampleDialogAppDef,
        codes: exampleCodes(),
        server,
        views: registry,
        observer: new MemoryUiObserver(),
        messenger,
        store: new MemoryConversationStore(),
        logger: new MemoryLogger(),
        people: async () => A,
        peers: async () => undefined,
        callers: example.callers,
        places: {
          place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
        },
      });
      return { conversations, messenger };
    };
    const common = nodeOf(exampleDialogViews);
    const overridden = nodeOf(own);

    for (const [i, node] of [common, overridden].entries()) {
      await node.conversations.receive({
        id: `over-${i}`,
        peer: PEER,
        sender: 'sender-a',
        kind: 'enter',
        entry: 'start',
      });
    }

    const commonLine = lineAt(common.messenger, 0);
    const ownLine = lineAt(overridden.messenger, 0);
    expect(textOf(ownLine.message)).toBe('Список мессенджера: 0');
    expect(textOf(commonLine.message)).toStartWith('Мои задачи');
    expect(ownLine.message.options.map((o) => o.label)).toEqual(
      commonLine.message.options.map((o) => o.label),
    );
  });
});

describe('Conversations — место в снимке и размер показанного', () => {
  test('экран с текстом больше предела схемы — снимок записан: свежие seen и экран, у места нет сообщения; после перезапуска сигнал без броска и без retire', async () => {
    const bus = new AwaitingBus();
    const example = new ExampleApp(
      { mode: 'test', dataDir: tmp().path, users: [A] },
      { bus, logger: new MemoryLogger(), clock: () => T0 },
    );
    const server = new UiServer({
      set: ExampleUiSetDef,
      dispatch: new ApiAppDispatch(example.api),
      context: { bus, logger: new MemoryLogger() },
    });
    // Фрагмент длиннее предела схемы сообщения места: мессенджер его
    // принимает, снимок — нет.
    const huge = exampleDialogViews.over([
      ScreenPresenter.of(TaskListScreenDef, {
        render: (_view, kit) =>
          kit.message(`Список ${'x'.repeat(MAX_FRAGMENT_TEXT)}`),
      }),
    ]);
    const store = new MemoryConversationStore();
    const messenger = MemoryMessenger.editing();
    const nodeOf = () =>
      new Conversations({
        app: ExampleDialogAppDef,
        codes: exampleCodes(),
        server,
        views: huge,
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
    const signal = (id: string) => ({ id, peer: PEER, sender: 'sender-a' });
    const first = nodeOf();
    await first.receive({ ...signal('huge-1'), kind: 'enter', entry: 'start' });
    const raw = await store.load(PEER);
    await first.close();

    const second = nodeOf();
    const from = messenger.journal.length;
    await second.receive({ ...signal('huge-2'), kind: 'cancel' });
    const after = await store.load(PEER);
    await second.close();

    expect(v.safeParse(ConversationSnapshotSchema, raw).success).toBe(true);
    const saved = v.parse(ConversationSnapshotSchema, raw);
    expect(saved.seen).toEqual(['huge-1']);
    expect(saved.screen?.instance).toMatchObject({
      address: { screen: 'exampleUi/todo/taskList' },
    });
    expect(saved.screen?.handles).toHaveLength(1);
    expect(saved.screen).not.toHaveProperty('message');
    expect(v.parse(ConversationSnapshotSchema, after).seen).toEqual([
      'huge-1',
      'huge-2',
    ]);
    expect(opsOf(messenger, from)).toEqual(['show m2']);
  });
});
