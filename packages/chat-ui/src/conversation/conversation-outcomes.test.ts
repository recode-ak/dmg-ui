import { describe, expect, test } from 'bun:test';
import {
  CoreErrors,
  type DomainError,
  ErrorDef,
  ErrorText,
  err,
  ok,
  type Result,
  Trace,
} from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import {
  CompleteTaskUcDef,
  ExampleAppDef,
  TaskErrors,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type Address,
  type AnyScreenDef,
  CodeLoader,
  CodeLoaders,
  type DataOf,
  type OpenOptions,
  type RefreshSignal,
  type RenderContext,
  ScreenCode,
  ScreenDef,
  type ScreenInstance,
  ScreenRuntime,
  type StateOf,
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
import type { Delivery } from '../messenger/messenger.types';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import type {
  ConversationExit,
  ConversationExits,
  ConversationSnapshot,
  RefEntry,
} from './conversation.types';

// Таблица исходов беседы (гайд «Пакет канала», §4): по тесту на строку —
// исход действия ядра (`ActionOutcome`, у `unavailable` — каждая причина) и
// локального действия (`LocalOutcome`), вид в отказе и неизвестная ссылка.
// «Живое место» — у мессенджера с правкой правка на месте (`edit`), у
// мессенджера без правки — новое сообщение через `update`. Реакция на
// нажатие у мессенджера с ответом — текст ответа без сообщения, без ответа —
// заметка; ответ на нажатие один. Беседа — на исполнителе с заглушками и
// локальными Def, на двух подставных мессенджерах.

const A = testUuid(1);
const PEER = 'peer-a';
const LOBBY = 'outUi/out/lobby';
const DESK = 'outUi/out/desk';
const BROKEN = 'outUi/out/broken';
const MISSING = testUuid(9);

/** Данные экранов сцены: тест меняет их между сигналами, код читает при загрузке и пишет вызовы. */
type World = {
  count: number;
  broken: boolean;
  readonly calls: string[];
};

const worldOf = (): World => ({ count: 2, broken: false, calls: [] });

/** Вход «в начало»: текст без вариантов. */
const LobbyScreenDef = ScreenDef.define({
  name: 'lobby',
  label: 'Лобби',
  description: 'Вход «в начало».',
  reads: [],
  data: v.object({}),
});

/** Стол: действие на месте, переход и выход. */
const DeskScreenDef = ScreenDef.define({
  name: 'desk',
  label: 'Стол',
  description: 'Действие на месте, переход и выход.',
  reads: [],
  data: v.object({ count: v.pipe(v.number(), v.description('Число')) }),
  actions: {
    stay: { label: 'Остаться', description: 'Остаётся на экране.' },
    go: {
      label: 'Перейти',
      description: 'Переход в лобби.',
      to: (): readonly AnyScreenDef[] => [LobbyScreenDef],
    },
    finish: { label: 'Завершить', description: 'Выход сторис.' },
  },
  exits: {
    done: {
      label: 'Работа завершена',
      description: 'Работа за столом окончена.',
    },
  },
});

/** Хранилище: подтверждение и действие с UC; у одного кода отказа — свой текст. */
const VaultScreenDef = ScreenDef.define({
  name: 'vault',
  label: 'Хранилище',
  description: 'Подтверждение и действие с UC.',
  reads: [],
  data: v.object({}),
  actions: {
    drop: {
      label: 'Удалить',
      description: 'Действие с подтверждением.',
      confirm: { label: 'Удалить всё?', description: 'Вернуть нельзя.' },
    },
    send: {
      label: 'Отправить',
      description: 'Вызывает UC.',
      uc: CompleteTaskUcDef,
    },
  },
  catches: [TaskErrors.ALREADY_DONE],
});

const Title = v.pipe(
  v.string(),
  v.maxLength(5, 'Не длиннее 5 знаков'),
  v.description('Название'),
);

/** Форма: поле с проверкой длины; у второго действия — ещё и подтверждение. */
const FormScreenDef = ScreenDef.define({
  name: 'form',
  label: 'Форма',
  description: 'Поле с проверкой длины.',
  reads: [],
  data: v.object({}),
  actions: {
    rename: {
      label: 'Переименовать',
      description: 'Поле названия.',
      input: v.object({ title: Title }),
    },
    rewrite: {
      label: 'Переписать',
      description: 'Поле названия и подтверждение.',
      input: v.object({ title: Title }),
      confirm: { label: 'Переписать?', description: 'Название сменится.' },
    },
  },
});

/** Пульт: действие и локальное действие доступны, только когда пульт взведён. */
const SwitchScreenDef = ScreenDef.define({
  name: 'switch',
  label: 'Пульт',
  description: 'Доступность по состоянию.',
  reads: [],
  data: v.object({}),
  state: v.strictObject({
    armed: v.pipe(v.boolean(), v.description('Взведён')),
  }),
  actions: {
    fire: { label: 'Пуск', description: 'Доступно, когда взведён.' },
  },
  locals: {
    arm: { label: 'Взвести', description: 'Взводит и снимает.' },
    zap: { label: 'Искра', description: 'Доступно, когда взведён.' },
  },
});

/** Лаборатория: локальные действия — бросает, отвергает вход, меняет. */
const LabScreenDef = ScreenDef.define({
  name: 'lab',
  label: 'Лаборатория',
  description: 'Исходы локального действия.',
  reads: [],
  data: v.object({}),
  state: v.strictObject({
    ticks: v.pipe(v.number(), v.description('Число отметок')),
    level: v.pipe(v.string(), v.description('Уровень')),
  }),
  locals: {
    boom: { label: 'Сломать', description: 'Бросок кода экрана.' },
    tune: {
      label: 'Настроить',
      description: 'Поле с проверкой длины.',
      input: v.object({
        level: v.pipe(
          v.string(),
          v.maxLength(3, 'Не длиннее 3 знаков'),
          v.description('Уровень'),
        ),
      }),
    },
    tick: { label: 'Отметить', description: 'Прибавляет отметку.' },
  },
});

/** Экран, загрузка которого отказывает, пока `broken`. */
const BrokenScreenDef = ScreenDef.define({
  name: 'broken',
  label: 'Сломанный',
  description: 'Отказ загрузки.',
  reads: [],
  data: v.object({}),
});

class LobbyCode extends ScreenCode<typeof LobbyScreenDef> {
  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class DeskCode extends ScreenCode<typeof DeskScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof DeskScreenDef>> = {
    stay: {
      done: () => {
        this.world.calls.push('stay');
        return DeskScreenDef.at({});
      },
    },
    go: { done: () => LobbyScreenDef.at({}) },
    finish: { done: () => DeskScreenDef.exits.done.with() },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<
    Result<DataOf<typeof DeskScreenDef>, DomainError>
  > {
    return ok({ count: this.world.count });
  }
}

class VaultCode extends ScreenCode<typeof VaultScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof VaultScreenDef>> = {
    drop: {
      done: () => {
        this.world.calls.push('drop');
        return VaultScreenDef.at({});
      },
    },
    send: {
      command: () => ({ taskId: MISSING }),
      done: () => VaultScreenDef.at({}),
    },
  };

  constructor(private readonly world: World) {
    super();
  }

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
    rewrite: {
      done: ({ input }) => {
        this.world.calls.push(`rewrite:${input.title}`);
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
}

type Switch = typeof SwitchScreenDef;

class SwitchCode extends ScreenCode<Switch> {
  override readonly locals = {
    arm: (state: StateOf<Switch>): StateOf<Switch> => ({
      armed: !state.armed,
    }),
    zap: (state: StateOf<Switch>): StateOf<Switch> => {
      this.world.calls.push('zap');
      return state;
    },
  };

  override readonly actions: Partial<ActionSteps<Switch>> = {
    fire: {
      done: () => {
        this.world.calls.push('fire');
        return SwitchScreenDef.at({});
      },
    },
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override initialState(): StateOf<Switch> {
    return { armed: false };
  }

  /** `zap` и `fire` отключены, пока пульт не взведён: `arm` доступно всегда. */
  override readonly availability = {
    zap: ({ state }: { readonly state: StateOf<Switch> }) =>
      SwitchCode.armedOnly(state),
    fire: ({ state }: { readonly state: StateOf<Switch> }) =>
      SwitchCode.armedOnly(state),
  };

  private static armedOnly(state: StateOf<Switch>) {
    return state.armed
      ? ({ kind: 'available' } as const)
      : ({ kind: 'disabled', text: 'Пульт не взведён' } as const);
  }
}

type Lab = typeof LabScreenDef;

class LabCode extends ScreenCode<Lab> {
  override readonly locals = {
    boom: (): StateOf<Lab> => {
      throw new Error('boom-mark-q7');
    },
    tune: (
      state: StateOf<Lab>,
      _data: DataOf<Lab>,
      input: { readonly level: string },
    ): StateOf<Lab> => ({ ...state, level: input.level }),
    tick: (state: StateOf<Lab>): StateOf<Lab> => ({
      ...state,
      ticks: state.ticks + 1,
    }),
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override initialState(): StateOf<Lab> {
    return { ticks: 0, level: '' };
  }
}

class BrokenCode extends ScreenCode<typeof BrokenScreenDef> {
  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    if (this.world.broken) {
      return TaskErrors.NOT_FOUND.err({ taskId: MISSING });
    }
    return ok({});
  }
}

const OutSetDef = UiSetDef.define({
  name: 'outUi',
  label: 'Набор исходов',
  description: 'Локальные экраны исходов беседы.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'out',
      label: 'Исходы',
      description: 'Экраны на каждый исход действия и локального действия.',
      screens: [
        LobbyScreenDef,
        DeskScreenDef,
        VaultScreenDef,
        FormScreenDef,
        SwitchScreenDef,
        LabScreenDef,
        BrokenScreenDef,
      ],
      stories: [],
    }),
  ],
});

const entry = (label: string, address: Address) => ({
  label,
  description: `Вход: ${label}.`,
  address,
});

const OutAppDef = UiAppDef.define({
  name: 'outDialog',
  label: 'Исходы',
  description: 'Приложение UI локальных экранов исходов.',
  set: OutSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: entry('Лобби', LobbyScreenDef.at({})),
    desk: entry('Стол', DeskScreenDef.at({})),
    vault: entry('Хранилище', VaultScreenDef.at({})),
    form: entry('Форма', FormScreenDef.at({})),
    switch: entry('Пульт', SwitchScreenDef.at({})),
    lab: entry('Лаборатория', LabScreenDef.at({})),
    broken: entry('Сломанный', BrokenScreenDef.at({})),
  },
});

const views = ChatViews.of(OutSetDef, [
  ScreenPresenter.for(LobbyScreenDef, () => 'Лобби'),
  ScreenPresenter.for(DeskScreenDef, ({ data }) => `Стол: ${data?.count}`),
  ScreenPresenter.for(VaultScreenDef, () => 'Хранилище', {
    [TaskErrors.ALREADY_DONE.code]: 'Уже сделано.',
  }),
  ScreenPresenter.for(FormScreenDef, () => 'Форма'),
  ScreenPresenter.for(SwitchScreenDef, ({ state }) =>
    state?.armed === true ? 'Пульт взведён' : 'Пульт не взведён',
  ),
  ScreenPresenter.for(
    LabScreenDef,
    ({ state }) =>
      `Лаборатория: ${state?.ticks ?? 0}, уровень «${state?.level ?? ''}»`,
  ),
  ScreenPresenter.for(BrokenScreenDef, () => 'Починено'),
]);

/** Исполнитель, который помнит открытые экземпляры: тест закрывает живой мимо беседы. */
class OpenedRuntime extends ScreenRuntime {
  readonly opened: ScreenInstance[] = [];

  override async open(
    address: Address,
    options: OpenOptions,
  ): Promise<ScreenInstance> {
    const instance = await super.open(address, options);
    this.opened.push(instance);
    return instance;
  }
}

/** Мессенджер, который помнит каждый ответ на нажатие: без ответа в возможностях журнал их не пишет. */
class AnsweringMessenger extends MemoryMessenger {
  readonly answers: { readonly press: string; readonly text?: string }[] = [];

  override async answer(
    peer: string,
    press: string,
    text?: string,
  ): Promise<Delivery<void>> {
    this.answers.push(text === undefined ? { press } : { press, text });
    return super.answer(peer, press, text);
  }
}

const MESSENGERS = [
  [
    'editing',
    () =>
      new AnsweringMessenger({
        capabilities: MemoryMessenger.editing().capabilities,
      }),
  ],
  [
    'windowed',
    () =>
      new AnsweringMessenger({
        capabilities: MemoryMessenger.windowed(() => T0).capabilities,
        clock: () => T0,
      }),
  ],
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

const labelsOf = (message: Message) => message.options.map((o) => o.label);

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

/** Последнее сообщение беседы — то, что собеседник видит внизу. */
const lastLine = (messenger: MemoryMessenger) => {
  const line = messenger.chat(PEER).at(-1);
  if (line === undefined) throw new Error('сообщений нет');
  return line;
};

const lastText = (messenger: MemoryMessenger) =>
  textOf(lastLine(messenger).message);

/** Ссылка на действие живого экрана, которой вид не давал, — в снимок беседы (внешние данные). */
const withAction = (
  snapshot: ConversationSnapshot,
  ref: string,
  action: string,
  revision: number,
): ConversationSnapshot => {
  const screen = snapshot.screen;
  if (screen === undefined) throw new Error('в снимке нет экрана');
  const injected: RefEntry = {
    ref,
    kind: 'action',
    screen: screen.serial,
    revision,
    action,
    label: action,
  };
  return { ...snapshot, refs: [...snapshot.refs, injected] };
};

/** Беседа на исполнителе с заглушками; `snapshot` — беседа после перезапуска на том же мессенджере. */
const sceneOf = (options: {
  readonly messenger: AnsweringMessenger;
  readonly snapshot?: ConversationSnapshot;
  readonly context?: RenderContext;
  /** Приёмник выхода: ответ порта или бросок; журнал вызовов — в `taken`. */
  readonly exits?: 'accept' | 'refuse' | 'throw';
}) => {
  const world = worldOf();
  const logger = new MemoryLogger();
  const taken: ConversationExit[] = [];
  const exits: ConversationExits | undefined =
    options.exits === undefined
      ? undefined
      : {
          accept: async (exit) => {
            taken.push(exit);
            if (options.exits === 'throw') throw new Error('exit-mark-q7');
            return options.exits === 'accept';
          },
        };
  const { messenger } = options;
  const codes = CodeLoaders.of(OutSetDef, [
    CodeLoader.screen(LobbyScreenDef, async () => new LobbyCode()),
    CodeLoader.screen(DeskScreenDef, async () => new DeskCode(world)),
    CodeLoader.screen(VaultScreenDef, async () => new VaultCode(world)),
    CodeLoader.screen(FormScreenDef, async () => new FormCode(world)),
    CodeLoader.screen(SwitchScreenDef, async () => new SwitchCode(world)),
    CodeLoader.screen(LabScreenDef, async () => new LabCode()),
    CodeLoader.screen(BrokenScreenDef, async () => new BrokenCode(world)),
  ]);
  const kit = new RuntimeKit(codes, OutSetDef);
  const runtime = new OpenedRuntime({
    set: OutSetDef,
    codes,
    ucs: kit.ucs,
    refresh: kit.refresh,
    observer: kit.observer,
    faults: (fault) => kit.faults.push(fault),
  });
  const context = options.context ?? testRenderContext;
  const conversation = new Conversation(
    {
      app: OutAppDef,
      runtime,
      contexts: { context: async () => context },
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
      ...(exits === undefined ? {} : { exits }),
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
  /** Нажатие по ссылке; возвращает id нажатия — для проверки ответа. */
  const pressRef = async (ref: string): Promise<string> => {
    const at = head();
    const press = `p-${at.id}`;
    await conversation.receive({ ...at, kind: 'press', ref, press });
    return press;
  };
  return {
    kit,
    runtime,
    world,
    messenger,
    conversation,
    logger,
    taken,
    enter: async (name: string) => {
      await conversation.receive({ ...head(), kind: 'enter', entry: name });
    },
    text: async (text: string) => {
      await conversation.receive({ ...head(), kind: 'text', text });
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

type Scene = ReturnType<typeof sceneOf>;

describe.each(MESSENGERS)(
  'Conversation — таблица исходов (%s)',
  (name, make) => {
    const editing = name === 'editing';

    /** Показ в живое место после `from`: правка на месте и ответ без текста — или новое через `update`. */
    const placed = (s: Scene, from: number) => {
      const ops = opsOf(s.messenger, from);
      if (editing) {
        expect(ops).toEqual([`edit ${lastLine(s.messenger).handle}`, 'answer']);
      } else {
        expect(ops).toEqual([`update ${lastLine(s.messenger).handle}`]);
      }
    };

    /** Реакция на нажатие `press`: текст ответа без сообщения или заметка; ответ один. */
    const reacted = (s: Scene, from: number, press: string, text: string) => {
      const answers = s.messenger.answers.filter((a) => a.press === press);
      if (editing) {
        expect(s.messenger.journal.slice(from)).toEqual([
          { op: 'answered', peer: PEER, press, text },
        ]);
        expect(answers).toEqual([{ press, text }]);
      } else {
        expect(opsOf(s.messenger, from)).toEqual([
          `show ${lastLine(s.messenger).handle}`,
        ]);
        expect(lastText(s.messenger)).toBe(text);
        expect(labelsOf(lastLine(s.messenger).message)).toEqual([]);
        expect(answers).toStrictEqual([{ press }]);
      }
    };

    test('moved — экран адреса новым экземпляром в живое место, прежний закрыт', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('desk');
      const from = s.messenger.journal.length;

      await s.press('Перейти');

      placed(s, from);
      expect(lastText(s.messenger)).toBe('Лобби');
      expect(s.conversation.screen()?.address).toEqual({
        screen: LOBBY,
        params: {},
      });
      // Прежний экземпляр закрыт: перечитывание по событию слушает только новый.
      expect(s.kit.refresh.watching()).toEqual([{ screen: LOBBY, params: {} }]);
    });

    test('stayed — вид заново (ревизия выросла) в живое место, один показ без дубля проактивного', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('desk');
      const revision = s.conversation.screen()?.revision ?? 0;
      s.world.count = 3;
      const from = s.messenger.journal.length;

      await s.press('Остаться');
      await s.conversation.settled();

      placed(s, from);
      expect(lastText(s.messenger)).toBe('Стол: 3');
      expect(s.conversation.screen()?.revision).toBe(revision + 1);
      expect(s.world.calls).toEqual(['stay']);
    });

    test('exited — вход home, текст выхода перед видом входа одним сообщением в живое место', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('desk');
      const from = s.messenger.journal.length;

      await s.press('Завершить');

      placed(s, from);
      expect(lastText(s.messenger)).toBe(
        'Работа завершена\n\nРабота за столом окончена.\n\nЛобби',
      );
      expect(s.conversation.screen()?.address.screen).toBe(LOBBY);
    });

    describe('выход сторис приёмнику вне набора UI', () => {
      test('выход принят — порт вызван один раз, вход не открыт, прежнее сообщение погашено с нажатым', async () => {
        const s = sceneOf({ messenger: make(), exits: 'accept' });
        await s.enter('desk');
        const finish = refOf(s.messenger, 'Завершить');
        const from = s.messenger.journal.length;
        const answers = s.messenger.answers.length;

        const press = await s.pressRef(finish);

        // Строго: у выхода без данных поля `data` нет.
        expect(s.taken).toStrictEqual([
          { peer: PEER, person: A, screen: DESK, exit: 'done' },
        ]);
        expect(s.conversation.screen()).toBeUndefined();
        expect(s.messenger.chat(PEER)).toHaveLength(1);
        expect(s.messenger.answers.slice(answers)).toStrictEqual([{ press }]);
        expect(opsOf(s.messenger, from)).toEqual(
          editing ? ['retire m1', 'answer'] : [],
        );
        if (editing) {
          expect(s.messenger.journal[from]).toMatchObject({ chosen: finish });
        }
      });

      test('выход не принят — порт вызван, открыт вход «в начало»', async () => {
        const s = sceneOf({ messenger: make(), exits: 'refuse' });
        await s.enter('desk');

        await s.press('Завершить');

        expect(s.taken).toHaveLength(1);
        expect(s.conversation.screen()?.address.screen).toBe(LOBBY);
      });

      test('ссылка погашенного экрана — «Эта кнопка устарела.», порт и ядро больше не вызваны', async () => {
        const s = sceneOf({ messenger: make(), exits: 'accept' });
        await s.enter('desk');
        const stay = refOf(s.messenger, 'Остаться');
        await s.press('Завершить');
        const records = s.kit.observer.records.length;
        const from = s.messenger.journal.length;

        const press = await s.pressRef(stay);

        reacted(s, from, press, 'Эта кнопка устарела.');
        expect(s.taken).toHaveLength(1);
        expect(s.world.calls).toEqual([]);
        expect(s.kit.observer.records).toHaveLength(records);
      });

      test('бросок порта — error с operation: exit и именем без текста, открыт вход «в начало»', async () => {
        const s = sceneOf({ messenger: make(), exits: 'throw' });
        await s.enter('desk');

        await s.press('Завершить');

        const errors = s.logger.records.filter((r) => r.level === 'error');
        expect(errors.map((r) => r.meta)).toEqual([
          {
            messenger: s.messenger.capabilities.name,
            operation: 'exit',
            name: 'Error',
          },
        ]);
        expect(JSON.stringify(s.logger.records)).not.toContain('mark-q7');
        expect(s.conversation.screen()?.address.screen).toBe(LOBBY);
      });

      test('вход после принятого выхода — новое сообщение, погашенное не правится', async () => {
        const s = sceneOf({ messenger: make(), exits: 'accept' });
        await s.enter('desk');
        await s.press('Завершить');
        const from = s.messenger.journal.length;

        await s.enter('desk');

        const chat = s.messenger.chat(PEER);
        expect(chat).toHaveLength(2);
        expect(chat[0]?.edits).toBe(0);
        expect(textOf(chat[1]?.message as Message)).toBe('Стол: 2');
        expect(
          s.messenger.journal.slice(from).some((r) => r.op === 'edited'),
        ).toBe(false);
        expect(s.conversation.screen()?.address.screen).toBe(DESK);
      });
    });

    test('confirm — вопрос «подпись, описание» с «Да» и «Нет» в живом месте: «Нет» — вид снова, «Да» — исполнение', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('vault');

      await s.press('Удалить');
      const asked = lastLine(s.messenger).message;
      await s.press('Нет');
      const afterNo = [...s.world.calls];
      const declined = lastText(s.messenger);
      await s.press('Удалить');
      await s.press('Да');

      expect(textOf(asked)).toBe('Удалить всё?\n\nВернуть нельзя.');
      expect(labelsOf(asked)).toEqual(['Да', 'Нет']);
      expect(afterNo).toEqual([]);
      expect(declined).toBe('Хранилище');
      expect(s.world.calls).toEqual(['drop']);
      expect(lastText(s.messenger)).toBe('Хранилище');
      if (editing) {
        expect(s.messenger.chat(PEER)).toMatchObject([
          { handle: 'm1', edits: 4, retired: false },
        ]);
        expect(
          opsOf(s.messenger).filter((op) => op.startsWith('retire')),
        ).toEqual([]);
      } else {
        expect(s.messenger.chat(PEER)).toHaveLength(5);
        expect(
          s.messenger.chat(PEER).map((line) => textOf(line.message)),
        ).toEqual([
          'Хранилище',
          'Удалить всё?\n\nВернуть нельзя.',
          'Хранилище',
          'Удалить всё?\n\nВернуть нельзя.',
          'Хранилище',
        ]);
        // Каждый показ — в живое место: мессенджер без правки шлёт новое через `update`.
        expect(opsOf(s.messenger).slice(1)).toEqual(
          Array.from({ length: 4 }, (_, i) => `update m${i + 2}`),
        );
      }
    });

    test('rejected с черновиком — вопрос поля из первого замечания с его текстом; верный ввод — одно исполнение', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('form');
      await s.press('Переименовать');
      const question = lastText(s.messenger);

      await s.text('длинное');
      const repeated = lastText(s.messenger);
      await s.text('Хлеб');

      expect(question).toBe('Введите: Название');
      expect(repeated).toBe('Не длиннее 5 знаков\n\nВведите: Название');
      expect(s.world.calls).toEqual(['rename:Хлеб']);
      expect(lastText(s.messenger)).toBe('Форма');
    });

    test('rejected без черновика — вид с текстом замечания в живом месте', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('form');
      await s.press('Переписать');
      await s.text('длинное');
      const asked = lastText(s.messenger);
      const from = s.messenger.journal.length;

      await s.press('Да');

      expect(asked).toBe('Переписать?\n\nНазвание сменится.');
      placed(s, from);
      expect(lastText(s.messenger)).toBe('Не длиннее 5 знаков\n\nФорма');
      expect(s.world.calls).toEqual([]);
    });

    test('refused — вид с текстом отказа перед ним в живом месте; у кода из catches — текст представления', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('vault');
      s.kit.ucs.answer(
        CompleteTaskUcDef,
        err(ErrorDef.serialize(TaskErrors.ALREADY_DONE.make())),
      );
      const caughtFrom = s.messenger.journal.length;
      await s.press('Отправить');
      placed(s, caughtFrom);
      const caught = lastText(s.messenger);
      s.kit.ucs.answer(
        CompleteTaskUcDef,
        err(ErrorDef.serialize(TaskErrors.ARCHIVED.make())),
      );
      const from = s.messenger.journal.length;

      await s.press('Отправить');

      placed(s, from);
      expect(caught).toBe('Уже сделано.\n\nХранилище');
      const archived = ErrorText.of(TaskErrors.ARCHIVED.make()).summary;
      expect(lastText(s.messenger)).toBe(`${archived}\n\nХранилище`);
    });

    test('stale — вид на новых данных с заметкой «Экран обновился.» в живом месте; действие не исполнено', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('desk');
      const stay = refOf(s.messenger, 'Остаться');
      s.world.count = 5;
      await s.refresh();
      const from = s.messenger.journal.length;

      await s.pressRef(stay);

      placed(s, from);
      expect(lastText(s.messenger)).toBe('Экран обновился.\n\nСтол: 5');
      expect(s.world.calls).toEqual([]);
    });

    test('unavailable: disabled — реакция «Действие сейчас недоступно.»', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('switch');
      await s.press('Взвести');
      const fire = refOf(s.messenger, 'Пуск');
      await s.press('Взвести');
      const from = s.messenger.journal.length;

      const press = await s.pressRef(fire);

      reacted(s, from, press, 'Действие сейчас недоступно.');
      expect(s.world.calls).toEqual([]);
    });

    test('unavailable: readOnly — реакция «Действие сейчас недоступно.», UC не вызван', async () => {
      const messenger = make();
      const context = { ...testRenderContext, readOnly: true };
      const first = sceneOf({ messenger, context });
      await first.enter('vault');
      const revision = first.conversation.screen()?.revision ?? 0;
      // Вид «только чтение» действия с UC не даёт: ссылка — из снимка, как после перезапуска.
      const saved = withAction(
        first.conversation.snapshot(),
        'readonly1',
        'send',
        revision,
      );
      first.conversation.close();
      const second = sceneOf({ messenger, context, snapshot: saved });
      const from = messenger.journal.length;

      const press = await second.pressRef('readonly1');

      reacted(second, from, press, 'Действие сейчас недоступно.');
      expect(second.kit.ucs.names()).toEqual([]);
    });

    test('unavailable: closed — реакция «Эта кнопка устарела.»', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('desk');
      s.runtime.opened.at(-1)?.close();
      const from = s.messenger.journal.length;

      const press = await s.press('Остаться');

      reacted(s, from, press, 'Эта кнопка устарела.');
      expect(s.world.calls).toEqual([]);
    });

    test('unavailable: unknown — дефект беседы, бросок; ответ на нажатие без текста всё равно уходит', async () => {
      const messenger = make();
      const first = sceneOf({ messenger });
      await first.enter('desk');
      const revision = first.conversation.screen()?.revision ?? 0;
      const saved = withAction(
        first.conversation.snapshot(),
        'unknown1',
        'nowhere',
        revision,
      );
      first.conversation.close();
      const second = sceneOf({ messenger, snapshot: saved });
      const from = messenger.journal.length;
      const answers = messenger.answers.length;

      await expect(second.pressRef('unknown1')).rejects.toThrow();

      expect(opsOf(messenger, from)).toEqual(editing ? ['answer'] : []);
      expect(messenger.answers.slice(answers)).toStrictEqual([
        { press: expect.any(String) },
      ]);
    });

    test('локальное changed — вид в живое место, один показ без дубля проактивного', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('lab');
      const from = s.messenger.journal.length;

      await s.press('Отметить');
      await s.conversation.settled();

      placed(s, from);
      expect(lastText(s.messenger)).toBe('Лаборатория: 1, уровень «»');
    });

    test('локальное rejected — вопрос поля с текстом замечания; верный ввод меняет состояние', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('lab');
      await s.press('Настроить');

      await s.text('высокий');
      const repeated = lastText(s.messenger);
      await s.text('мин');

      expect(repeated).toBe('Не длиннее 3 знаков\n\nВведите: Уровень');
      expect(lastText(s.messenger)).toBe('Лаборатория: 0, уровень «мин»');
    });

    test('локальное refused — вид с текстом отказа в живом месте, экземпляр прежний', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('lab');
      await s.press('Отметить');
      const state = s.conversation.screen()?.state;
      const from = s.messenger.journal.length;

      await s.press('Сломать');

      placed(s, from);
      const defect = ErrorText.of(CoreErrors.SERVER_INTERNAL.make()).summary;
      expect(lastText(s.messenger)).toBe(
        `${defect}\n\nЛаборатория: 1, уровень «»`,
      );
      expect(s.conversation.screen()?.state).toEqual(state);
    });

    test('локальное unavailable — реакция «Действие сейчас недоступно.»', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('switch');
      await s.press('Взвести');
      const zap = refOf(s.messenger, 'Искра');
      await s.press('Взвести');
      const from = s.messenger.journal.length;

      const press = await s.pressRef(zap);

      reacted(s, from, press, 'Действие сейчас недоступно.');
      expect(s.world.calls).toEqual([]);
    });

    test('вид в отказе — «Повторить» открывает тот же адрес, «В начало» — вход home', async () => {
      const s = sceneOf({ messenger: make() });
      s.world.broken = true;
      await s.enter('broken');
      const refused = lastLine(s.messenger).message;
      const homeFrom = s.messenger.journal.length;
      await s.press('В начало');
      placed(s, homeFrom);
      const home = lastText(s.messenger);
      await s.enter('broken');
      s.world.broken = false;
      const from = s.messenger.journal.length;

      await s.press('Повторить');

      placed(s, from);
      const summary = ErrorText.of(
        TaskErrors.NOT_FOUND.make({ taskId: MISSING }),
      ).summary;
      expect(textOf(refused)).toBe(summary);
      expect(labelsOf(refused)).toEqual(['Повторить', 'В начало']);
      expect(home).toBe('Лобби');
      expect(lastText(s.messenger)).toBe('Починено');
      expect(s.conversation.screen()?.address.screen).toBe(BROKEN);
      const opened = s.kit.observer.records.filter(
        (r) => r.kind === 'opened' && r.node === BROKEN,
      );
      expect(opened).toHaveLength(3);
    });

    test('неизвестная ссылка — реакция «Эта кнопка устарела.»; ответ один, положение не сбито', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('desk');
      const from = s.messenger.journal.length;

      const press = await s.pressRef('zzzzz9');
      reacted(s, from, press, 'Эта кнопка устарела.');
      const next = s.messenger.journal.length;
      await s.press('Остаться');

      // После текста ответа место по-прежнему последнее — правка на месте;
      // после заметки — новым сообщением.
      expect(opsOf(s.messenger, next)).toEqual(
        editing ? ['edit m1', 'answer'] : ['show m3'],
      );
      expect(s.world.calls).toEqual(['stay']);
    });
  },
);
