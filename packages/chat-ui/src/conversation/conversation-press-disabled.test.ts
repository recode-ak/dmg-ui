import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result, Trace } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { CompleteTaskUcDef, ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type Address,
  AppCodeLoaders,
  Availability,
  CodeLoader,
  CodeLoaders,
  type RefreshSignal,
  type RenderContext,
  ScreenCode,
  ScreenDef,
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
import { LimitedMessenger } from '../messenger/limited-messenger';
import type { Delivery, MessageHandle } from '../messenger/messenger.types';
import { AppChatViews } from '../view/app-chat-views';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';

// Нажатие по отключённому варианту (пометка `🚫` в подписи): беседа отвечает
// причиной из живого вида в момент нажатия — ответом на нажатие у мессенджера
// с таким ответом, заметкой у остальных; ядро не вызывается, экземпляр,
// ревизия, состояние, место и черновик входа прежние. Мессенджеры:
// с ответом на нажатие (`editing`) и без него (`windowed`).

const PEER = 'peer-a';
const A = testUuid(1);
const MISSING = testUuid(9);
const MARK = '🚫';
/** Начало причины пульта: к нему дописывается число недостающих отметок. */
const NEED = 'Нужно отметок';
const LAUNCH_REASON = 'Запуск закрыт до утра';
/** Текст ядра «только чтение»: действия с UC в виде отключены им, не кодом экрана. */
const READ_ONLY_TEXT = 'Только чтение: изменения недоступны';
const UNAVAILABLE = 'Действие сейчас недоступно.';
const CLOSED = 'Эта кнопка устарела.';
const FIRE = `${MARK} Пуск`;

/** Данные сцены: тест меняет ответы доступности между сигналами, код пишет вызовы. */
type World = {
  /** Начало причины отключённого «Пуск». */
  reason: string;
  /** «Пуск» скрыт кодом экрана (смена субъекта). */
  hidden: boolean;
  /** «Пуск» доступен независимо от числа отметок. */
  force: boolean;
  readonly calls: string[];
};

const worldOf = (): World => ({
  reason: NEED,
  hidden: false,
  force: false,
  calls: [],
});

/** Пульт: «Пуск» доступен после трёх отметок; пока их меньше — отключён с причиной. */
const PultScreenDef = ScreenDef.define({
  name: 'pult',
  label: 'Пульт',
  description: 'Отключённое действие с причиной по состоянию.',
  reads: [],
  data: v.object({}),
  state: v.strictObject({
    ticks: v.pipe(v.number(), v.description('Число отметок')),
  }),
  actions: {
    stay: { label: 'Остаться', description: 'Остаётся на экране.' },
    fire: { label: 'Пуск', description: 'Доступно после трёх отметок.' },
  },
  locals: {
    tick: { label: 'Отметить', description: 'Прибавляет отметку.' },
  },
});

/** Форма: поле названия и всегда отключённое действие. */
const FormScreenDef = ScreenDef.define({
  name: 'form',
  label: 'Форма',
  description: 'Поле названия и отключённое действие.',
  reads: [],
  data: v.object({}),
  actions: {
    rename: {
      label: 'Назвать',
      description: 'Поле названия.',
      input: v.object({
        title: v.pipe(v.string(), v.description('Название')),
      }),
    },
    launch: { label: 'Запуск', description: 'Всегда отключено.' },
  },
});

/** Хранилище: действие с UC, которое «только чтение» отключает текстом ядра. */
const VaultScreenDef = ScreenDef.define({
  name: 'vault',
  label: 'Хранилище',
  description: 'Действие с UC.',
  reads: [],
  data: v.object({}),
  actions: {
    send: {
      label: 'Отправить',
      description: 'Вызывает UC.',
      uc: CompleteTaskUcDef,
    },
  },
});

type Pult = typeof PultScreenDef;

class PultCode extends ScreenCode<Pult> {
  override readonly locals = {
    tick: (state: StateOf<Pult>): StateOf<Pult> => ({
      ticks: state.ticks + 1,
    }),
  };

  override readonly actions: Partial<ActionSteps<Pult>> = {
    stay: {
      done: () => {
        this.world.calls.push('stay');
        return PultScreenDef.at({});
      },
    },
    fire: {
      done: () => {
        this.world.calls.push('fire');
        return PultScreenDef.at({});
      },
    },
  };

  override readonly availability = {
    fire: ({ state }: { readonly state: StateOf<Pult> }) => this.fire(state),
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override initialState(): StateOf<Pult> {
    return { ticks: 0 };
  }

  private fire(state: StateOf<Pult>) {
    if (this.world.hidden) return Availability.hidden();
    if (this.world.force || state.ticks >= 3) return Availability.yes();
    return Availability.disabled(`${this.world.reason}: ${3 - state.ticks}`);
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
    launch: { done: () => FormScreenDef.at({}) },
  };

  override readonly availability = {
    launch: () => Availability.disabled(LAUNCH_REASON),
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class VaultCode extends ScreenCode<typeof VaultScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof VaultScreenDef>> = {
    send: {
      command: () => ({ taskId: MISSING }),
      done: () => VaultScreenDef.at({}),
    },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

const PressUiModuleDef = UiModuleDef.define({
  name: 'press',
  label: 'Нажатия',
  description: 'Пульт, форма и хранилище.',
  screens: [PultScreenDef, FormScreenDef, VaultScreenDef],
  stories: [],
});

const PressSetDef = UiSetDef.define({
  name: 'pressUi',
  label: 'Набор нажатий',
  description: 'Экраны с отключёнными вариантами.',
  app: ExampleAppDef,
  modules: [PressUiModuleDef],
});

const entry = (label: string, address: Address) => ({
  label,
  description: `Вход: ${label}.`,
  address,
});

const PressAppDef = UiAppDef.define({
  name: 'pressDialog',
  label: 'Нажатия',
  description: 'Приложение UI экранов с отключёнными вариантами.',
  set: PressSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: entry('Пульт', PultScreenDef.at({})),
    form: entry('Форма', FormScreenDef.at({})),
    vault: entry('Хранилище', VaultScreenDef.at({})),
  },
});

const views = AppChatViews.ofSet(PressSetDef, [
  ChatViews.of(PressUiModuleDef, [
    ScreenPresenter.for(
      PultScreenDef,
      ({ state }) => `Пульт: ${state?.ticks ?? 0}`,
    ),
    ScreenPresenter.for(FormScreenDef, () => 'Форма'),
    ScreenPresenter.for(VaultScreenDef, () => 'Хранилище'),
  ]),
]);

/** Мессенджер, который помнит каждый ответ на нажатие и каждый уход сообщения с нажатым. */
class RecordingMessenger extends MemoryMessenger {
  readonly answers: { readonly press: string; readonly text?: string }[] = [];
  readonly retired: { readonly handle: string; readonly chosen?: string }[] =
    [];

  override async answer(
    peer: string,
    press: string,
    text?: string,
  ): Promise<Delivery<void>> {
    this.answers.push(text === undefined ? { press } : { press, text });
    return super.answer(peer, press, text);
  }

  override async retire(
    peer: string,
    handle: MessageHandle,
    message: Message,
    chosen?: string,
  ): Promise<Delivery<void>> {
    this.retired.push(chosen === undefined ? { handle } : { handle, chosen });
    return super.retire(peer, handle, message, chosen);
  }
}

const MESSENGERS = [
  [
    'editing',
    () =>
      new RecordingMessenger({
        capabilities: MemoryMessenger.editing().capabilities,
      }),
  ],
  [
    'windowed',
    () =>
      new RecordingMessenger({
        capabilities: MemoryMessenger.windowed(() => T0).capabilities,
        clock: () => T0,
      }),
  ],
] as const;

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

const lastLine = (messenger: MemoryMessenger) => {
  const line = messenger.chat(PEER).at(-1);
  if (line === undefined) throw new Error('сообщений нет');
  return line;
};

const lastText = (messenger: MemoryMessenger) =>
  textOf(lastLine(messenger).message);

/** Беседа на исполнителе с заглушками; `limited` — перед портом страж лимитов, как у узла бесед. */
const sceneOf = (options: {
  readonly messenger: RecordingMessenger;
  readonly context?: RenderContext;
  readonly limited?: boolean;
}) => {
  const world = worldOf();
  const logger = new MemoryLogger();
  const { messenger } = options;
  const codes = AppCodeLoaders.ofSet(PressSetDef, [
    CodeLoaders.of(PressUiModuleDef, [
      CodeLoader.screen(PultScreenDef, async () => new PultCode(world)),
      CodeLoader.screen(FormScreenDef, async () => new FormCode(world)),
      CodeLoader.screen(VaultScreenDef, async () => new VaultCode()),
    ]),
  ]);
  const kit = new RuntimeKit(codes);
  const context = options.context ?? testRenderContext;
  const conversation = new Conversation({
    app: PressAppDef,
    runtime: kit.runtime,
    contexts: { context: async () => context },
    traces: new DialogTraces(() => {
      requests += 1;
      return `r-${requests}`;
    }),
    views,
    messenger:
      options.limited === true
        ? new LimitedMessenger({ port: messenger, logger })
        : messenger,
    logger,
    peer: PEER,
    person: A,
    home: 'start',
    epochs: () => {
      epochs += 1;
      return `ep${String(epochs).padStart(3, '0')}`;
    },
  });
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
  'Conversation — нажатие по отключённому варианту (%s)',
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

    test('нажатие помеченного — причина ответом или заметкой; ядро не вызвано, ревизия, состояние и сообщение прежние', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      const fire = refOf(s.messenger, FIRE);
      const shown = s.messenger.chat(PEER);
      const { revision, state } = s.conversation.screen() ?? {};
      const from = s.messenger.journal.length;

      const press = await s.pressRef(fire);

      reacted(s, from, press, `${NEED}: 3`);
      expect(s.messenger.chat(PEER)[0]).toEqual(shown[0]);
      expect(s.conversation.screen()?.revision).toBe(revision);
      expect(s.conversation.screen()?.state).toEqual(state);
      expect(s.kit.ucs.names()).toEqual([]);
      expect(s.world.calls).toEqual([]);
    });

    test('после ответа следующий показ — как после устаревшей ссылки: правка на месте или новое сообщение', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      await s.pressRef(refOf(s.messenger, FIRE));
      const next = s.messenger.journal.length;

      await s.press('Отметить');

      expect(opsOf(s.messenger, next)).toEqual(
        editing ? ['edit m1', 'answer'] : ['show m3'],
      );
    });

    test('причина — из живого вида: после смены состояния прежняя ссылка отвечает новой причиной', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      const fire = refOf(s.messenger, FIRE);
      await s.press('Отметить');
      const from = s.messenger.journal.length;

      const press = await s.pressRef(fire);

      reacted(s, from, press, `${NEED}: 2`);
      expect(s.world.calls).toEqual([]);
    });

    test('действие стало доступным — вид заново с «Экран обновился.», ядро не вызвано; новая ссылка исполняет', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      const fire = refOf(s.messenger, FIRE);
      for (let i = 0; i < 3; i += 1) await s.press('Отметить');
      const from = s.messenger.journal.length;

      await s.pressRef(fire);

      placed(s, from);
      expect(lastText(s.messenger)).toBe('Экран обновился.\n\nПульт: 3');
      expect(labelsOf(lastLine(s.messenger).message)).toContain('Пуск');
      expect(s.world.calls).toEqual([]);
      expect(s.kit.ucs.names()).toEqual([]);

      await s.press('Пуск');

      expect(s.world.calls).toEqual(['fire']);
    });

    test('действие стало скрыто — «Действие сейчас недоступно.»; прежняя причина нигде не показана', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      const fire = refOf(s.messenger, FIRE);
      s.world.hidden = true;
      await s.refresh();
      const refreshed = labelsOf(lastLine(s.messenger).message);
      const from = s.messenger.journal.length;

      const press = await s.pressRef(fire);

      reacted(s, from, press, UNAVAILABLE);
      expect(refreshed).toContain('Остаться');
      expect(refreshed).not.toContain('Пуск');
      expect(refreshed).not.toContain(FIRE);
      expect(JSON.stringify(s.messenger.journal)).not.toContain(NEED);
      expect(s.world.calls).toEqual([]);
    });

    test('экран сменился — ссылка отключённого прежнего экрана: «Эта кнопка устарела.»', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      const fire = refOf(s.messenger, FIRE);
      await s.enter('form');
      const from = s.messenger.journal.length;

      const press = await s.pressRef(fire);

      reacted(s, from, press, CLOSED);
      expect(s.world.calls).toEqual([]);
    });

    test('два нажатия подряд — по одному ответу на каждое', async () => {
      const s = sceneOf({ messenger: make() });
      await s.enter('start');
      const fire = refOf(s.messenger, FIRE);

      const first = await s.pressRef(fire);
      const second = await s.pressRef(fire);

      expect(s.messenger.answers.map((a) => a.press)).toEqual([first, second]);
      expect(s.world.calls).toEqual([]);
    });
  },
);

describe('Conversation — нажатие по отключённому варианту: особые случаи', () => {
  const editing = () =>
    new RecordingMessenger({
      capabilities: MemoryMessenger.editing().capabilities,
    });

  const windowed = () =>
    new RecordingMessenger({
      capabilities: MemoryMessenger.windowed(() => T0).capabilities,
      clock: () => T0,
    });

  test('на живом сообщении действие стало доступным, а показ не дошёл — прежнее сообщение уходит с нажатым, вид заново с «Экран обновился.»', async () => {
    const s = sceneOf({ messenger: windowed() });
    await s.enter('start');
    const fire = refOf(s.messenger, FIRE);
    s.world.force = true;
    s.messenger.failNext('rejected');
    await s.refresh();
    expect(s.messenger.retired).toEqual([]);

    await s.pressRef(fire);

    expect(s.messenger.retired).toEqual([{ handle: 'm1', chosen: fire }]);
    expect(lastText(s.messenger)).toBe('Экран обновился.\n\nПульт: 0');
    expect(s.world.calls).toEqual([]);
    expect(s.kit.ucs.names()).toEqual([]);
  });

  test('черновик входа жив: вопрос поля начат, нажатие помеченного — причина, следующий текст отвечает на поле', async () => {
    const s = sceneOf({ messenger: editing() });
    await s.enter('form');
    const launch = refOf(s.messenger, `${MARK} Запуск`);
    await s.press('Назвать');
    const draft = s.conversation.snapshot().draft?.serial;
    const from = s.messenger.journal.length;

    const press = await s.pressRef(launch);

    expect(draft).toBeDefined();
    expect(s.messenger.journal.slice(from)).toEqual([
      { op: 'answered', peer: PEER, press, text: LAUNCH_REASON },
    ]);
    expect(s.conversation.snapshot().draft?.serial).toBe(draft);
    expect(s.world.calls).toEqual([]);

    await s.text('Хлеб');

    expect(s.world.calls).toEqual(['rename:Хлеб']);
  });

  test('заместитель «только чтение»: действие с UC помечено, ответ — текст ядра, UC не вызван', async () => {
    const s = sceneOf({
      messenger: editing(),
      context: { ...testRenderContext, readOnly: true },
    });
    await s.enter('vault');
    const labels = labelsOf(lastLine(s.messenger).message);
    const from = s.messenger.journal.length;

    const press = await s.press(`${MARK} Отправить`);

    expect(labels).toEqual([`${MARK} Отправить`]);
    expect(s.messenger.journal.slice(from)).toEqual([
      { op: 'answered', peer: PEER, press, text: READ_ONLY_TEXT },
    ]);
    expect(s.kit.ucs.names()).toEqual([]);
  });

  test('причина длиннее ответа на нажатие — ответ один, обрезан стражем лимитов до предела', async () => {
    const s = sceneOf({ messenger: editing(), limited: true });
    // 120 эмодзи — 240 единиц UTF-16 сверх предела 200 и 120 кодовых точек.
    s.world.reason = '😀'.repeat(120);
    await s.enter('start');

    await s.press(FIRE);

    const [answer, ...rest] = s.messenger.answers;
    expect(rest).toEqual([]);
    expect(answer?.text?.length).toBeLessThanOrEqual(200);
    expect(answer?.text?.startsWith('😀')).toBe(true);
    expect(answer?.text).not.toBe(`${'😀'.repeat(120)}: 3`);
    expect(
      s.messenger.journal.filter((record) => record.op === 'answered'),
    ).toHaveLength(1);
  });

  test('журнал логгера не содержит ни причины, ни подписи (ERR-07)', async () => {
    const s = sceneOf({ messenger: editing() });
    await s.enter('start');

    await s.press(FIRE);

    const log = JSON.stringify(s.logger.records);
    expect(log).not.toContain(NEED);
    expect(log).not.toContain('Пуск');
    expect(log).not.toContain(MARK);
    expect(s.logger.records.filter((r) => r.level === 'error')).toEqual([]);
  });
});
