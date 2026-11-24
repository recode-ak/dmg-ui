import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  ExampleApp,
  ExampleAppDef,
  type ExampleUser,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type AnyUiAppDef,
  type AnyUiSetDef,
  AppCodeLoaders,
  CodeLoader,
  CodeLoaders,
  ScreenCode,
  ScreenDef,
  StoryDef,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import {
  AppChatViews,
  ChatViews,
  Conversations,
  DIALOG_CHANNEL,
  MemoryConversationStore,
  ScreenPresenter,
} from 'dmg-ui/chat-ui';
import {
  ExampleDialogUiAppDef,
  exampleDialogViews,
} from 'dmg-ui/chat-ui/testing';
import {
  ApiAppDispatch,
  type PersonPlaces,
  type UcDispatch,
  UiServer,
} from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  FollowAssignedStoryDef,
  MainMenuScreenDef,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import { TelegramMessenger, TelegramUpdates } from 'dmg-ui/tg-bot';
import * as v from 'valibot';
import {
  type BotApiCall,
  type BotChatLine,
  MemoryBotApi,
  TestUpdates,
} from '.';

// `/help` на Telegram: сигнал `help` беседы приходит командой личного чата;
// справка — одно новое сообщение без кнопок (`sendMessage`), ни правок, ни
// ухода прежнего сообщения; ядро не вызывается.
// Мир — учебное приложение: апдейты идут через `TelegramUpdates` на
// подставном порту Bot API. Длинная справка — на своём наборе с огромной
// подсказкой экрана. Содержание справки (скрытое, отключённое, подсказки
// дверей) проверяют беседа (`conversation-help.test.ts`) и приёмка.

const A = testUuid(1);
const CHAT_A = 7350001234;
const BOT = 7350009000;
const ENTRY_POINTS = [
  { entry: 'start', via: 'command', key: 'start' },
  { entry: 'assigned', via: 'command', key: 'assigned' },
  { entry: 'menu', via: 'command', key: 'menu' },
];
/** Предел текста сообщения Bot API, в единицах UTF-16. */
const TEXT_LIMIT = 4096;
const tmp = useTempDir('dmg-ui-telegram-help-');

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

/** Экран с подсказкой длиннее предела текста сообщения. */
const LONG_HINT = 'я'.repeat(5000);
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
const LongStoryDef = StoryDef.define({
  name: 'longStory',
  label: 'Длинная',
  description: 'Сторис с длинным экраном.',
  callers: ['user'],
  goal: 'чтобы проверить предел текста',
  start: LongScreenDef,
  screens: [LongScreenDef],
  outcomes: {},
});
const LongUiModuleDef = UiModuleDef.define({
  name: 'long',
  label: 'Длинный',
  description: 'Один экран.',
  screens: [LongScreenDef],
  stories: [LongStoryDef],
});

const LongSetDef = UiSetDef.define({
  name: 'longUi',
  label: 'Набор длинного экрана',
  description: 'Набор с одним экраном с огромной подсказкой.',
  app: ExampleAppDef,
  modules: [LongUiModuleDef],
});
const LongAppDef = UiAppDef.define({
  name: 'longDialog',
  label: 'Длинное приложение',
  description: 'Приложение UI с одним длинным экраном.',
  set: LongSetDef,
  channel: DIALOG_CHANNEL,
  stories: [LongStoryDef],
  entries: {
    start: {
      label: 'Длинный',
      description: 'Длинный экран.',
      address: LongScreenDef.at({}),
    },
  },
});

class LongCode extends ScreenCode<typeof LongScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof LongScreenDef>> = {
    stay: { done: () => LongScreenDef.at({}) },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

/** Набор, приложение, код и представления мира. */
type Kit = {
  readonly app: AnyUiAppDef;
  readonly set: AnyUiSetDef;
  readonly codes: AppCodeLoaders;
  readonly views: AppChatViews;
};

const EXAMPLE: Kit = {
  app: ExampleDialogUiAppDef,
  set: ExampleUiSetDef,
  codes: exampleCodes({}, ExampleDialogUiAppDef),
  views: exampleDialogViews(ExampleDialogUiAppDef),
};

const LONG: Kit = {
  app: LongAppDef,
  set: LongSetDef,
  codes: AppCodeLoaders.of(LongAppDef, [
    CodeLoaders.of(LongUiModuleDef, [
      CodeLoader.screen(LongScreenDef, async () => new LongCode()),
    ]),
  ]),
  views: AppChatViews.of(LongAppDef, [
    ChatViews.of(LongUiModuleDef, [
      ScreenPresenter.for(LongScreenDef, () => 'Длинный'),
    ]),
  ]),
};

/** Вызовы с текстом нового сообщения. */
const sends = (journal: readonly BotApiCall[]) =>
  journal.flatMap((call) =>
    call.method === 'sendMessage' ? [call.params] : [],
  );

const edits = (journal: readonly BotApiCall[]) =>
  journal.filter(
    (call) =>
      call.method === 'editMessageText' ||
      call.method === 'editMessageReplyMarkup',
  );

const linesOf = (line: BotChatLine): string[] => line.text.split('\n');

/** Приложение, сервер, порт Bot API и хранилище бесед; один узел бесед на двух людей. */
const world = (kit: Kit = EXAMPLE) => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const context = { bus, logger };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A] },
    { ...context, clock: () => T0 },
  );
  const inner = new ApiAppDispatch(example.api);
  /** Имена UC, которые дошли от беседы до приложения. */
  const calls: string[] = [];
  const dispatch: UcDispatch<ExampleUser> = {
    dispatch: async (request) => {
      calls.push(request.uc.name);
      return inner.dispatch(request);
    },
  };
  const server = new UiServer({ set: kit.set, dispatch, context });
  const api = new MemoryBotApi();
  const updates = new TestUpdates();
  const people = new Map([[String(CHAT_A), A]]);
  const peerOf = new Map([[A, String(CHAT_A)]]);
  let epoch = 0;
  const messenger = new TelegramMessenger({ api, logger });
  const conversations = new Conversations({
    app: kit.app,
    codes: kit.codes,
    server,
    views: kit.views,
    observer: new MemoryUiObserver(),
    messenger,
    store: new MemoryConversationStore(),
    logger,
    people: async (sender) => people.get(sender),
    peers: async (uuid) => peerOf.get(uuid),
    callers: example.callers,
    places,
    epochs: () => {
      epoch += 1;
      return `e${String(epoch).padStart(4, '0')}`;
    },
  });
  const telegram = new TelegramUpdates({
    conversations,
    messenger,
    logger,
    entryPoints: ENTRY_POINTS,
    bot: BOT,
  });

  const settle = async () => {
    await bus.delivered();
    await conversations.settled();
  };

  const person = (chat: number) => {
    /** Живое место — последнее сообщение чата с нажимаемой кнопкой. */
    const place = (): BotChatLine => {
      const line = api
        .chat(chat)
        .findLast((l) =>
          l.keyboard.flat().some((button) => 'callback_data' in button),
        );
      if (line === undefined) throw new Error('живого места нет');
      return line;
    };
    /** Кнопка живого места по подписи: её данные и сообщение. */
    const find = (label: string) => {
      const line = place();
      const button = line.keyboard.flat().find((one) => one.text === label);
      if (button === undefined || !('callback_data' in button)) {
        throw new Error(`нет кнопки «${label}» в живом месте`);
      }
      return { line, button, data: button.callback_data };
    };
    const pressData = async (data: string, messageId: number) => {
      await telegram.receive(updates.press(chat, data, messageId));
    };
    return {
      say: (text: string) => telegram.receive(updates.text(chat, text)),
      place,
      find,
      pressData,
      /** Нажатие кнопки живого места по подписи. */
      press: async (label: string) => {
        const { data, line } = find(label);
        await pressData(data, line.message_id);
      },
      /** Последнее сообщение чата. */
      last: (): BotChatLine => {
        const line = api.chat(chat).at(-1);
        if (line === undefined) throw new Error('сообщений нет');
        return line;
      },
    };
  };

  return {
    api,
    logger,
    calls,
    settle,
    a: person(CHAT_A),
  };
};

describe('Telegram — /help на живом экране', () => {
  test('справка — ровно один sendMessage без кнопок; правок нет; сообщение меню не тронуто; UC не вызван', async () => {
    const w = world();
    await w.a.say('/menu');
    await w.settle();
    const menu = w.a.place();
    const calls = w.calls.length;
    const from = w.api.journal.length;

    await w.a.say('/help');
    await w.settle();

    const after = w.api.journal.slice(from);
    expect(sends(after)).toHaveLength(1);
    expect(edits(after)).toEqual([]);
    expect(sends(after)[0]?.reply_markup).toBeUndefined();
    const lines = linesOf(w.a.last());
    expect(lines).toContain(`Справка: ${MainMenuScreenDef.label}`);
    expect(lines).toContain(MainMenuScreenDef.hint!);
    expect(
      lines.some((line) => line.includes(FollowAssignedStoryDef.hint!)),
    ).toBe(true);
    expect(w.api.chat(CHAT_A)[0]).toEqual(menu);
    expect(w.calls).toHaveLength(calls);
  });
});

describe('Telegram — /help: предел текста и недоставка', () => {
  test('длинная справка — одно сообщение не длиннее 4096 знаков, начало справки сохранено', async () => {
    const w = world(LONG);
    await w.a.say('/start');
    await w.settle();
    const from = w.api.journal.length;

    await w.a.say('/help');
    await w.settle();

    const after = sends(w.api.journal.slice(from));
    expect(LONG_HINT.length).toBeGreaterThan(TEXT_LIMIT);
    expect(after).toHaveLength(1);
    expect((after[0]?.text ?? '').length).toBeLessThanOrEqual(TEXT_LIMIT);
    expect(after[0]?.text.startsWith('Справка: Длинный')).toBe(true);
  });

  test('отказ Bot API на sendMessage — беседа живёт: warn без текста справки, следующая справка доходит', async () => {
    const w = world();
    await w.a.say('/menu');
    await w.settle();
    const place = w.a.place();
    w.api.failOn('sendMessage', {
      error_code: 400,
      description: 'Bad Request: chat not found',
    });

    await w.a.say('/help');
    await w.settle();

    const warns = w.logger.records.filter((r) => r.level === 'warn');
    expect(warns.length).toBeGreaterThan(0);
    const logged = JSON.stringify(w.logger.records);
    expect(logged).not.toContain('Справка');
    expect(logged).not.toContain(MainMenuScreenDef.hint!);
    expect(w.a.place()).toEqual(place);

    await w.a.say('/help');
    await w.settle();

    expect(w.a.last().text).toContain(`Справка: ${MainMenuScreenDef.label}`);
  });
});
