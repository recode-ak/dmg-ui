import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result, Rule } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import {
  CompleteTaskUcDef,
  ExampleAppDef,
  type ExampleUser,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type Address,
  type AnyScreenDef,
  Availability,
  CodeLoader,
  CodeLoaders,
  type RenderContext,
  ScreenCode,
  ScreenDef,
  type StateOf,
  StoryDef,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { RuntimeKit, T0, testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogTraces } from '../dialog/dialog-traces';
import { PlainText } from '../message/plain-text';
import { LimitedMessenger } from '../messenger/limited-messenger';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import type {
  ConversationExit,
  ConversationSnapshot,
} from './conversation.types';

// Сигнал `help`: справка по живому экрану (без него — общая) приходит
// заметкой, новым сообщением без вариантов. Экземпляр, ссылки, путь, черновик
// и ядро не затрагиваются; сбита только «последнесть» места. Скрытого в
// справке нет, отключённое — с причиной из вида. Мессенджеры: с правкой на
// месте (`editing`) и без неё (`windowed`). Экраны — локальные Def со
// сторис: узел с дверью, стол с полем и правами, документы, длинный экран.

const PEER = 'peer-a';
const A = testUuid(1);
const MISSING = testUuid(9);
const REASON = 'Приём закрыт до утра';
/** Текст ядра «только чтение»: действия с UC в виде отключены им, не кодом экрана. */
const READ_ONLY_TEXT = 'Только чтение: изменения недоступны';
const HUB_ID = 'helpUi/help/hub';

const LONG_HINT = 'я'.repeat(5000);

type World = {
  mode: 'open' | 'disabled';
  readonly calls: string[];
};

/** Узел: дверь в документы, закрытие с выходом и локальное действие. */
const HubScreenDef = ScreenDef.define({
  name: 'hub',
  label: 'Узел',
  description: 'ОПИСАНИЕ_ЭКРАНА узел с дверью.',
  hint: 'Отсюда начинается работа',
  reads: [],
  data: v.object({}),
  state: v.strictObject({
    ticks: v.pipe(v.number(), v.description('Число отметок')),
  }),
  actions: {
    docs: {
      label: 'Документы',
      description: 'ОПИСАНИЕ_ДВЕРИ.',
      to: (): readonly AnyScreenDef[] => [DocsScreenDef],
    },
    close: { label: 'Закрыть', description: 'ОПИСАНИЕ_ДЕЙСТВИЯ.' },
  },
  locals: {
    tick: { label: 'Отметить', description: 'ОПИСАНИЕ_ЛОКАЛЬНОГО.' },
  },
  exits: {
    closed: { label: 'Работа закончена', description: 'Узел закрыт.' },
  },
});

/** Стол: основное действие с полем, действие для администратора, действие с UC. */
const DeskScreenDef = ScreenDef.define({
  name: 'desk',
  label: 'Стол',
  description: 'ОПИСАНИЕ_ЭКРАНА стол с полем и правами.',
  hint: 'Заполните форму или отправьте её',
  reads: [],
  data: v.object({}),
  actions: {
    fill: {
      label: 'Заполнить',
      description: 'ОПИСАНИЕ_ДЕЙСТВИЯ.',
      hint: 'Название и срок',
      input: v.object({
        title: v.pipe(v.string(), v.description('Название')),
      }),
    },
    manage: { label: 'Управлять', description: 'Только администратору.' },
    send: {
      label: 'Отправить',
      description: 'Вызывает UC.',
      uc: CompleteTaskUcDef,
    },
  },
  primary: 'fill',
});

const DocsScreenDef = ScreenDef.define({
  name: 'docs',
  label: 'Документы',
  description: 'ОПИСАНИЕ_ЭКРАНА документы.',
  hint: 'Здесь лежат документы',
  reads: [],
  data: v.object({}),
  actions: {
    read: { label: 'Читать', description: 'Остаётся на экране.' },
  },
});

/** Экран с подсказкой длиннее любого предела текста мессенджера. */
const LongScreenDef = ScreenDef.define({
  name: 'long',
  label: 'Длинный',
  description: 'Экран с огромной подсказкой.',
  hint: LONG_HINT,
  reads: [],
  data: v.object({}),
  actions: {
    stay: { label: 'Остаться', description: 'Остаётся на экране.' },
  },
});

const DocsStoryDef = StoryDef.define({
  name: 'docsStory',
  label: 'Документы приложения',
  description: 'ОПИСАНИЕ_СТОРИС документы.',
  hint: 'Почитайте документы',
  callers: ['user'],
  goal: 'ЦЕЛЬ_СТОРИС чтобы почитать',
  start: DocsScreenDef,
  screens: [DocsScreenDef],
  outcomes: {},
});

const WorkStoryDef = StoryDef.define({
  name: 'work',
  label: 'Работа',
  description: 'ОПИСАНИЕ_СТОРИС работа.',
  hint: 'Главная работа',
  callers: ['user'],
  goal: 'ЦЕЛЬ_СТОРИС чтобы работать',
  start: HubScreenDef,
  screens: [HubScreenDef, DeskScreenDef, LongScreenDef],
  outcomes: {
    closed: {
      label: 'Работа закончена',
      description: 'Узел закрыт.',
      exits: [HubScreenDef.exits.closed],
      after: 'home',
    },
  },
  leads: () => [DocsStoryDef],
});

const HelpSetDef = UiSetDef.define({
  name: 'helpUi',
  label: 'Набор справки',
  description: 'Экраны и сторис справки в беседе.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'help',
      label: 'Справка',
      description: 'Узел, стол, документы и длинный экран.',
      screens: [HubScreenDef, DeskScreenDef, DocsScreenDef, LongScreenDef],
      stories: [WorkStoryDef, DocsStoryDef],
    }),
  ],
});

const entry = (label: string, address: Address) => ({
  label,
  description: `Вход: ${label}.`,
  address,
});

const HelpAppDef = UiAppDef.define({
  name: 'helpDialog',
  label: 'Приложение справки',
  description: 'Приложение UI справки в беседе.',
  set: HelpSetDef,
  channel: DIALOG_CHANNEL,
  stories: [WorkStoryDef, DocsStoryDef],
  entries: {
    start: entry('Узел', HubScreenDef.at({})),
    desk: entry('Стол', DeskScreenDef.at({})),
    docs: entry('Документы', DocsScreenDef.at({})),
    long: entry('Длинный', LongScreenDef.at({})),
  },
});

type Hub = typeof HubScreenDef;
type Desk = typeof DeskScreenDef;

class HubCode extends ScreenCode<Hub> {
  override readonly locals = {
    tick: (state: StateOf<Hub>): StateOf<Hub> => ({ ticks: state.ticks + 1 }),
  };

  override readonly actions: Partial<ActionSteps<Hub>> = {
    docs: { done: () => DocsScreenDef.at({}) },
    close: { done: () => HubScreenDef.exits.closed.with() },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override initialState(): StateOf<Hub> {
    return { ticks: 0 };
  }
}

class DeskCode extends ScreenCode<Desk, ExampleUser> {
  override readonly actions: Partial<ActionSteps<Desk, ExampleUser>> = {
    fill: {
      done: ({ input }) => {
        this.world.calls.push(`fill:${input.title}`);
        return DeskScreenDef.at({});
      },
    },
    manage: { done: () => DeskScreenDef.at({}) },
    send: {
      command: () => ({ taskId: MISSING }),
      done: () => DeskScreenDef.at({}),
    },
  };

  override readonly availability = {
    fill: () =>
      this.world.mode === 'disabled'
        ? Availability.disabled(REASON)
        : Availability.yes(),
    manage: ({ subject }: { readonly subject?: ExampleUser }) =>
      Availability.policy(Rule.hasRole('admin'), subject, {}),
  };

  constructor(private readonly world: World) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class DocsCode extends ScreenCode<typeof DocsScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof DocsScreenDef>> = {
    read: { done: () => DocsScreenDef.at({}) },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class LongCode extends ScreenCode<typeof LongScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof LongScreenDef>> = {
    stay: { done: () => LongScreenDef.at({}) },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

const views = ChatViews.of(HelpSetDef, [
  ScreenPresenter.for(HubScreenDef, () => 'Узел'),
  ScreenPresenter.for(DeskScreenDef, () => 'Стол'),
  ScreenPresenter.for(DocsScreenDef, () => 'Документы'),
  ScreenPresenter.for(LongScreenDef, () => 'Длинный'),
]);

const user = (admin = false): ExampleUser => ({
  uuid: A,
  hasRole: () => admin,
});

const MESSENGERS = [
  ['editing', () => MemoryMessenger.editing()],
  ['windowed', () => MemoryMessenger.windowed(() => T0)],
] as const;

let signals = 0;
let requests = 0;
let epochs = 0;

/** Беседа на заглушках портов с приложением справки; параметры сцены — в `options`. */
const sceneOf = (options: {
  readonly messenger: MemoryMessenger;
  readonly subject?: ExampleUser;
  readonly readOnly?: boolean;
  readonly mode?: World['mode'];
  /** Перед портом — страж лимитов, как у узла бесед. */
  readonly limited?: boolean;
  /** Приёмник выходов принимает выход. */
  readonly exits?: boolean;
  readonly snapshot?: ConversationSnapshot;
}) => {
  const world: World = { mode: options.mode ?? 'open', calls: [] };
  const logger = new MemoryLogger();
  const { messenger } = options;
  const codes = CodeLoaders.of(HelpSetDef, [
    CodeLoader.screen(HubScreenDef, async () => new HubCode()),
    CodeLoader.screen(DeskScreenDef, async () => new DeskCode(world)),
    CodeLoader.screen(DocsScreenDef, async () => new DocsCode()),
    CodeLoader.screen(LongScreenDef, async () => new LongCode()),
  ]);
  const kit = new RuntimeKit(codes, HelpSetDef, HelpAppDef);
  const context: RenderContext = {
    ...testRenderContext,
    subject: options.subject ?? user(),
    readOnly: options.readOnly ?? false,
  };
  const conversation = new Conversation(
    {
      app: HelpAppDef,
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
      ...(options.exits === true
        ? {
            exits: {
              accept: async (_exit: ConversationExit) => true,
            },
          }
        : {}),
      epochs: () => {
        epochs += 1;
        return `ep${String(epochs).padStart(3, '0')}`;
      },
    },
    options.snapshot,
  );
  const head = (id?: string) => {
    signals += 1;
    return { id: id ?? `s-${signals}`, peer: PEER, sender: 'sender-a' };
  };
  /** Ссылка варианта `label` из самого свежего сообщения беседы, где он есть. */
  const refOf = (label: string): string => {
    for (const line of [...messenger.chat(PEER)].reverse()) {
      const option = line.message.options.find((o) => o.label === label);
      if (option !== undefined) return option.ref;
    }
    throw new Error(`нет варианта «${label}»`);
  };
  const pressRef = async (ref: string) => {
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
    logger,
    messenger,
    conversation,
    refOf,
    pressRef,
    enter: (name: string) =>
      conversation.receive({ ...head(), kind: 'enter', entry: name }),
    say: (text: string) =>
      conversation.receive({ ...head(), kind: 'text', text }),
    press: (label: string) => pressRef(refOf(label)),
    help: (id?: string) => conversation.receive({ ...head(id), kind: 'help' }),
    /** Записи журнала мессенджера после `from`. */
    since: (from: number) => messenger.journal.slice(from),
    /** Текст последнего сообщения беседы, строками. */
    lines: (): string[] => {
      const line = messenger.chat(PEER).at(-1);
      if (line === undefined) throw new Error('сообщений нет');
      return PlainText.of(line.message.text).split('\n');
    },
  };
};

type Scene = ReturnType<typeof sceneOf>;

/** Снимок без отсева повторов и без «последнести» места: их справка меняет по замыслу. */
const stable = (snapshot: ConversationSnapshot) => ({
  ...snapshot,
  seen: [],
  screen:
    snapshot.screen === undefined
      ? undefined
      : { ...snapshot.screen, latest: undefined },
});

/** Ничего не вызвано: ни UC исполнителя, ни действий кода экранов. */
const untouched = (s: Scene) => {
  expect(s.kit.ucs.names()).toEqual([]);
  expect(s.world.calls).toEqual([]);
};

describe.each(MESSENGERS)('Conversation — справка (%s)', (_, make) => {
  test('живой экран: ровно одна заметка со справкой экрана без вариантов; правки и ухода нет; экран и снимок прежние', async () => {
    const s = sceneOf({ messenger: make() });
    await s.enter('start');
    const from = s.messenger.journal.length;
    const screen = s.conversation.screen();
    const snapshot = stable(s.conversation.snapshot());

    expect(await s.help()).toBe(true);

    const after = s.since(from);
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ op: 'sent', via: 'show' });
    const lines = s.lines();
    expect(lines).toContain(`Справка: ${HubScreenDef.label}`);
    expect(lines).toContain(HubScreenDef.hint!);
    expect(lines).toContain(`• ${HubScreenDef.actions.close.label}`);
    expect(lines).toContain(`• ${HubScreenDef.locals.tick.label}`);
    expect(lines).toContain(
      `• ${HubScreenDef.actions.docs.label} — ${DocsStoryDef.hint}`,
    );
    expect(s.messenger.chat(PEER).at(-1)?.message.options).toEqual([]);
    expect(s.conversation.screen()).toEqual(screen);
    expect(stable(s.conversation.snapshot())).toEqual(snapshot);
    expect(JSON.stringify(s.logger.records)).not.toContain(HubScreenDef.hint!);
    untouched(s);
  });

  test('кнопки экрана после справки живы: нажатие старой ссылки исполняется', async () => {
    const s = sceneOf({ messenger: make() });
    await s.enter('start');
    const tick = s.refOf(HubScreenDef.locals.tick.label);
    await s.help();
    untouched(s);

    await s.pressRef(tick);

    expect(s.conversation.screen()?.state).toEqual({ ticks: 1 });
  });

  test('нет живого экрана до первого входа: общая справка — корни приложения; экрана по-прежнему нет', async () => {
    const s = sceneOf({ messenger: make() });
    const from = s.messenger.journal.length;

    await s.help();

    expect(s.since(from)).toHaveLength(1);
    const lines = s.lines();
    expect(lines).toContain(`Справка: ${HelpAppDef.label}`);
    expect(lines).toContain(`• ${WorkStoryDef.label} — ${WorkStoryDef.hint}`);
    expect(lines.join('\n')).not.toContain(DocsStoryDef.label);
    expect(lines.join('\n')).not.toContain(HubScreenDef.hint!);
    expect(s.conversation.screen()).toBeUndefined();
    untouched(s);
  });

  test('нет живого экрана после выхода сторис (release): общая справка', async () => {
    const s = sceneOf({ messenger: make(), exits: true });
    await s.enter('start');
    await s.press(HubScreenDef.actions.close.label);
    expect(s.conversation.screen()).toBeUndefined();

    await s.help();

    const lines = s.lines();
    expect(lines).toContain(`Справка: ${HelpAppDef.label}`);
    expect(lines).toContain(`• ${WorkStoryDef.label} — ${WorkStoryDef.hint}`);
    expect(lines.join('\n')).not.toContain(HubScreenDef.hint!);
    expect(s.conversation.screen()).toBeUndefined();
  });

  test('черновик ввода жив: вопрос поля начат, справка — заметка, следующий текст отвечает на поле', async () => {
    const s = sceneOf({ messenger: make() });
    await s.enter('desk');
    await s.press(DeskScreenDef.actions.fill.label);
    const draft = s.conversation.snapshot().draft;
    expect(draft).toBeDefined();

    await s.help();

    expect(s.lines()).toContain(`Справка: ${DeskScreenDef.label}`);
    expect(s.conversation.snapshot().draft).toEqual(draft);
    expect(s.world.calls).toEqual([]);

    await s.say('Хлеб');

    expect(s.world.calls).toEqual(['fill:Хлеб']);
    expect(s.conversation.snapshot().draft).toBeUndefined();
  });

  test('путь не меняется: «Назад» после справки ведёт на прежний экран', async () => {
    const s = sceneOf({ messenger: make() });
    await s.enter('start');
    await s.press(HubScreenDef.actions.docs.label);
    const path = s.conversation.snapshot().path;
    expect(path).toHaveLength(1);

    await s.help();

    expect(s.lines()).toContain(`Справка: ${DocsScreenDef.label}`);
    expect(s.conversation.snapshot().path).toEqual(path);

    await s.press('Назад');

    expect(s.conversation.screen()?.address.screen).toBe(HUB_ID);
    expect(s.conversation.snapshot().path).toBeUndefined();
  });

  test('заместитель: действие с UC названо отключённым с текстом ядра; скрытое Policy не названо нигде', async () => {
    const s = sceneOf({ messenger: make(), readOnly: true });
    await s.enter('desk');
    const from = s.messenger.journal.length;

    await s.help();

    const lines = s.lines();
    expect(lines).toContain(
      `• ${DeskScreenDef.actions.send.label} (недоступно: ${READ_ONLY_TEXT})`,
    );
    expect(lines).toContain(
      `• ${DeskScreenDef.actions.fill.label} — ${DeskScreenDef.actions.fill.hint}`,
    );
    expect(s.since(from)).toHaveLength(1);
    expect(lines.join('\n')).not.toContain(DeskScreenDef.actions.manage.label);
    untouched(s);
  });

  test('скрыто Policy: у администратора действие названо, у остальных его нет', async () => {
    const owner = sceneOf({ messenger: make() });
    const admin = sceneOf({ messenger: make(), subject: user(true) });
    await owner.enter('desk');
    await admin.enter('desk');

    await owner.help();
    await admin.help();

    expect(admin.lines()).toContain(`• ${DeskScreenDef.actions.manage.label}`);
    expect(owner.lines().join('\n')).not.toContain(
      DeskScreenDef.actions.manage.label,
    );
  });

  test('отключено кодом экрана: справка называет действие с причиной из вида', async () => {
    const s = sceneOf({ messenger: make(), mode: 'disabled' });
    await s.enter('desk');

    await s.help();

    expect(s.lines()).toContain(
      `• ${DeskScreenDef.actions.fill.label} — ${DeskScreenDef.actions.fill.hint} (недоступно: ${REASON})`,
    );
  });

  test('снимок с живым экраном → новая беседа → справка: по восстановленному экрану', async () => {
    const first = sceneOf({ messenger: make() });
    await first.enter('desk');
    const snapshot = first.conversation.snapshot();
    const s = sceneOf({ messenger: make(), snapshot });

    await s.help();

    expect(s.messenger.chat(PEER)).toHaveLength(1);
    expect(s.lines()).toContain(`Справка: ${DeskScreenDef.label}`);
    expect(s.lines()).toContain(`• ${DeskScreenDef.actions.send.label}`);
    expect(s.conversation.screen()?.address.screen).toBe('helpUi/help/desk');
    untouched(s);
  });

  test('текст длиннее предела мессенджера: одно сообщение не длиннее text.max, начало справки сохранено', async () => {
    const s = sceneOf({ messenger: make(), limited: true });
    await s.enter('long');
    const from = s.messenger.chat(PEER).length;
    const { max } = s.messenger.capabilities.text;

    await s.help();

    const sent = s.messenger.chat(PEER).slice(from);
    expect(sent).toHaveLength(1);
    const line = sent[0];
    if (line === undefined) throw new Error('справки нет');
    const text = PlainText.of(line.message.text);
    expect(LONG_HINT.length).toBeGreaterThan(max);
    expect(text.length).toBeLessThanOrEqual(max);
    expect(text.startsWith(`Справка: ${LongScreenDef.label}`)).toBe(true);
  });

  test('недоставка заметки: беседа жива, warn без текста справки, следующая справка доходит', async () => {
    const s = sceneOf({ messenger: make() });
    await s.enter('start');
    const from = s.messenger.chat(PEER).length;
    s.messenger.failNext('unavailable');

    expect(await s.help()).toBe(true);

    expect(s.messenger.chat(PEER)).toHaveLength(from);
    expect(s.logger.records.some((r) => r.level === 'warn')).toBe(true);
    const logged = JSON.stringify(s.logger.records);
    expect(logged).not.toContain('Справка');
    expect(logged).not.toContain(HubScreenDef.hint!);
    expect(logged).not.toContain(DocsStoryDef.hint!);

    await s.help();

    expect(s.messenger.chat(PEER)).toHaveLength(from + 1);
    expect(s.lines()).toContain(`Справка: ${HubScreenDef.label}`);
  });

  test('справка дважды подряд — две заметки; повтор сигнала с тем же id отсеян', async () => {
    const s = sceneOf({ messenger: make() });
    await s.enter('start');
    const from = s.messenger.chat(PEER).length;

    expect(await s.help('help-1')).toBe(true);
    expect(await s.help('help-2')).toBe(true);
    expect(await s.help('help-2')).toBe(false);

    expect(s.messenger.chat(PEER)).toHaveLength(from + 2);
    untouched(s);
  });
});
