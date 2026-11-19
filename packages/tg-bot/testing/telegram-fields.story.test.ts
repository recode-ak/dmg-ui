import { describe, expect, test } from 'bun:test';
import { Trace } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import {
  CreateTaskUcDef,
  ExampleApp,
  type ExampleUser,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import { Conversations, MemoryConversationStore } from 'dmg-ui/chat-ui';
import {
  ExampleDialogAppDef,
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
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import { TelegramMessenger, TelegramUpdates } from 'dmg-ui/tg-bot';
import { type BotChatLine, MemoryBotApi, TestUpdates } from '.';

// Вопрос поля входа на Telegram: подпись, подсказка, пример и пределы из
// схемы — теми же строками, что в беседе; булево — кнопки «Да» и «Нет»
// обычными `callback_data`, без `style` и `disabled`; дата и число — текстом
// с замечанием схемы перед повторным вопросом. Введённые значения людей в
// журнал логгера не попадают (ERR-07). Мир — по образцу отключённого
// действия: задачи создаются мимо беседы, апдейты идут через `TelegramUpdates`.

const A = testUuid(1);
const CHAT_A = 7350001234;
const BOT = 7350009000;
const ENTRY_POINTS = [
  { entry: 'start', via: 'command', key: 'start' },
  { entry: 'assigned', via: 'command', key: 'assigned' },
];
const TITLE = 'Хлеб';
const URGENT_QUESTION = 'Выберите: Срочно\nСрочное напоминание придёт сразу';
const DATE_QUESTION = [
  'Введите: Когда',
  'День напоминания',
  'Пример: 2026-12-31',
].join('\n');
const DATE_ISSUE = 'Дата в виде ГГГГ-ММ-ДД';
const PART_QUESTION = [
  'Введите: Часть',
  'Номер части списка, с первой',
  'Пример: 2',
  'Пределы: от 1 до 99, целое',
].join('\n');
/** UC, которых «Напомнить» вызывать не должно: действие без UC. */
const MUTATING = ['createTask', 'completeTask', 'completeTasks', 'assignTask'];
/** Введённые людьми значения: их в журнале быть не должно. */
const TYPED_BAD = 'завтра';
const TYPED_DATE = '2027-01-15';
const tmp = useTempDir('dmg-ui-telegram-fields-');

const places: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

const labelsOf = (line: BotChatLine): string[] =>
  line.keyboard.flatMap((row) => row.map((button) => button.text));

/** Приложение, сервер, порт Bot API и беседы одного человека — владельца A. */
const world = () => {
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
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const api = new MemoryBotApi();
  const updates = new TestUpdates();
  const messenger = new TelegramMessenger({ api, logger });
  let epoch = 0;
  const conversations = new Conversations({
    app: ExampleDialogAppDef,
    codes: exampleCodes(),
    server,
    views: exampleDialogViews,
    observer: new MemoryUiObserver(),
    messenger,
    store: new MemoryConversationStore(),
    logger,
    people: async (sender) => (sender === String(CHAT_A) ? A : undefined),
    peers: async (uuid) => (uuid === A ? String(CHAT_A) : undefined),
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

  /** Живое место — последнее сообщение чата с нажимаемой кнопкой. */
  const place = (): BotChatLine => {
    const line = api
      .chat(CHAT_A)
      .findLast((l) =>
        l.keyboard.flat().some((button) => 'callback_data' in button),
      );
    if (line === undefined) throw new Error('живого места нет');
    return line;
  };

  return {
    logger,
    calls,
    place,
    /** Задача владельца A создана мимо беседы. */
    create: async (title: string): Promise<void> => {
      const trace = Trace.fromRequest({ requestId: `r-create-${title}` });
      const caller = await example.callers.resolve(A, trace);
      if (!caller.ok) throw new Error('вызывающий не найден');
      const created = await example.api.dispatch(
        TodoModuleDef,
        CreateTaskUcDef.command({ title }),
        caller.value,
        trace,
      );
      if (!created.ok) throw new Error('createTask не исполнен');
      await bus.delivered();
    },
    say: (text: string) => telegram.receive(updates.text(CHAT_A, text)),
    /** Нажатие кнопки живого места по подписи. */
    press: async (label: string) => {
      const line = place();
      const button = line.keyboard.flat().find((one) => one.text === label);
      if (button === undefined || !('callback_data' in button)) {
        throw new Error(`нет кнопки «${label}» в живом месте`);
      }
      await telegram.receive(
        updates.press(CHAT_A, button.callback_data, line.message_id),
      );
    },
    /** Текст последнего сообщения чата; вопрос без кнопок — тоже. */
    last: (): string => api.chat(CHAT_A).at(-1)?.text ?? '',
    settle: async () => {
      await bus.delivered();
      await conversations.settled();
    },
  };
};

type World = ReturnType<typeof world>;

/** Владелец A открыл карточку «Хлеб»: «/start», «Открыть задачу», «Хлеб». */
const onCard = async (): Promise<World> => {
  const w = world();
  await w.create(TITLE);
  await w.say('/start');
  await w.settle();
  await w.press('Открыть задачу');
  await w.press(TITLE);
  await w.settle();
  return w;
};

describe('Telegram — поле-булево: «Напомнить» → «Срочно»', () => {
  test('вопрос: подпись и подсказка; кнопки «Да» и «Нет» — обычные, с callback_data, без style и disabled', async () => {
    const w = await onCard();

    await w.press('Напомнить');
    const line = w.place();

    expect(line.text).toBe(URGENT_QUESTION);
    const buttons = line.keyboard
      .flat()
      .filter((button) => ['Да', 'Нет'].includes(button.text));
    expect(buttons.map((button) => button.text).sort()).toEqual(['Да', 'Нет']);
    for (const button of buttons) {
      expect(button).toHaveProperty('callback_data');
      expect(button).not.toHaveProperty('style');
      expect(button).not.toHaveProperty('disabled');
    }
  });

  test('ответ «Да» ведёт к вопросу о дате: подсказка и пример', async () => {
    const w = await onCard();
    await w.press('Напомнить');

    await w.press('Да');

    expect(w.last()).toBe(DATE_QUESTION);
  });
});

describe('Telegram — поле-дата: «Напомнить» → «Когда»', () => {
  /** До конца: «Да», «завтра», дата; возвращает текст после «завтра» и счёт вызовов UC перед последним вводом. */
  const remind = async (w: World) => {
    await w.press('Напомнить');
    await w.press('Да');
    await w.say(TYPED_BAD);
    const noted = w.last();
    const before = w.calls.length;
    await w.say(TYPED_DATE);
    await w.settle();
    return { noted, before };
  };

  test('«завтра» — замечание схемы, пустая строка, повтор вопроса с подсказкой и примером', async () => {
    const w = await onCard();
    await w.press('Напомнить');
    await w.press('Да');

    await w.say(TYPED_BAD);

    expect(w.last()).toBe(`${DATE_ISSUE}\n\n${DATE_QUESTION}`);
  });

  test('верная дата — снова карточка с «Напомнить» и «К списку», UC напоминания и записи не вызван', async () => {
    const w = await onCard();

    const { before } = await remind(w);

    expect(labelsOf(w.place())).toEqual(
      expect.arrayContaining(['Напомнить', 'К списку']),
    );
    for (const uc of MUTATING) expect(w.calls.slice(before)).not.toContain(uc);
  });

  test('журнал логгера: введённых «завтра» и даты нет (ERR-07)', async () => {
    const w = await onCard();

    await remind(w);

    const journal = JSON.stringify(w.logger.records);
    expect(journal).not.toContain(TYPED_BAD);
    expect(journal).not.toContain(TYPED_DATE);
  });
});

describe('Telegram — поле-число: «К части»', () => {
  const asked = async (): Promise<World> => {
    const w = world();
    await w.create(TITLE);
    await w.say('/start');
    await w.settle();
    await w.press('К части');
    return w;
  };

  test('вопрос: подпись, подсказка, пример, пределы по строке', async () => {
    const w = await asked();

    expect(w.last()).toBe(PART_QUESTION);
  });

  test('«0» — замечание схемы «Части начинаются с первой», затем тот же вопрос', async () => {
    const w = await asked();

    await w.say('0');

    expect(w.last()).toBe(`Части начинаются с первой\n\n${PART_QUESTION}`);
  });
});
