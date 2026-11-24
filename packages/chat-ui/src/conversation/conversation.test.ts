import { describe, expect, test } from 'bun:test';
import {
  type DomainError,
  ok,
  type Result,
  type SerializedResult,
  Trace,
} from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import {
  CompleteTaskUcDef,
  ExampleAppDef,
  ListTasksUcDef,
} from 'dmg-core/testing/example';
import {
  type ActionSteps,
  type AnyScreenDef,
  AppCodeLoaders,
  CodeLoader,
  CodeLoaders,
  type DataOf,
  type LoadContext,
  type RefreshSignal,
  ScreenCode,
  ScreenDef,
  type StateOf,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { RuntimeKit, testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger, type MessengerEntry } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogTraces } from '../dialog/dialog-traces';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import type {
  Delivery,
  MessageHandle,
  OptionLimits,
  SendOptions,
  Updated,
} from '../messenger/messenger.types';
import { AppChatViews } from '../view/app-chat-views';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import type {
  ConversationSignal,
  ConversationSnapshot,
} from './conversation.types';

// Одна беседа на исполнителе с заглушками портов: сигналы мессенджера,
// нажатие по записи таблицы ссылок, очередь, отсев повтора, проактивный
// показ и граница показа. Экраны — локальные Def без полей входа: сбор входа
// по шагам проверяется отдельно. Проверки — по журналу подставного
// мессенджера и логу беседы.

const A = testUuid(1);
const PEER = 'peer-a';
const DAY_MS = 86_400_000;
const HOME = 'convUi/conv/home';
const BLANK = 'convUi/conv/blank';

/** Другой экран: цель перехода с главного. */
const OtherScreenDef = ScreenDef.define({
  name: 'other',
  label: 'Другой',
  description: 'Экран после перехода.',
  reads: [],
  data: v.object({}),
});

/** Экран с пустым видом: ни текста, ни вариантов. */
const BlankScreenDef = ScreenDef.define({
  name: 'blank',
  label: 'Пустой',
  description: 'Вид без текста и без вариантов.',
  reads: [],
  data: v.object({}),
});

/**
 * Главный экран: действие с UC и без полей («Сохранить» — остаётся на
 * экране), переход («Дальше»), локальное действие без полей («Отметить»).
 */
const HomeScreenDef = ScreenDef.define({
  name: 'home',
  label: 'Главная',
  description: 'Действие, переход и локальное действие без полей.',
  reads: [ListTasksUcDef],
  data: v.object({
    count: v.pipe(v.number(), v.description('Число задач')),
  }),
  state: v.strictObject({
    ticks: v.pipe(v.number(), v.description('Число отметок')),
  }),
  actions: {
    save: {
      label: 'Сохранить',
      description: 'Вызывает UC и остаётся на экране.',
      uc: CompleteTaskUcDef,
    },
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

type Home = typeof HomeScreenDef;

class HomeCode extends ScreenCode<Home> {
  override readonly locals = {
    tick: (state: StateOf<Home>): StateOf<Home> => ({
      ticks: state.ticks + 1,
    }),
  };

  override readonly actions: Partial<ActionSteps<Home>> = {
    save: {
      command: () => ({ taskId: testUuid(7) }),
      done: () => HomeScreenDef.at({}),
    },
    leave: { done: () => OtherScreenDef.at({}) },
  };

  override async load({
    read,
  }: LoadContext<Home>): Promise<Result<DataOf<Home>, DomainError>> {
    const listed = await read(ListTasksUcDef, {});
    if (!listed.ok) return listed;
    return ok({ count: listed.value.length });
  }

  override initialState(): StateOf<Home> {
    return { ticks: 0 };
  }
}

class OtherCode extends ScreenCode<typeof OtherScreenDef> {
  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class BlankCode extends ScreenCode<typeof BlankScreenDef> {
  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

const ConvUiModuleDef = UiModuleDef.define({
  name: 'conv',
  label: 'Беседа',
  description: 'Главный, другой и пустой экраны.',
  screens: [HomeScreenDef, OtherScreenDef, BlankScreenDef],
  stories: [],
});

const ConvSetDef = UiSetDef.define({
  name: 'convUi',
  label: 'Набор беседы',
  description: 'Локальные экраны беседы без полей входа.',
  app: ExampleAppDef,
  modules: [ConvUiModuleDef],
});

const ConvAppDef = UiAppDef.define({
  name: 'convDialog',
  label: 'Беседа',
  description: 'Приложение UI локальных экранов беседы.',
  set: ConvSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Главная',
      description: 'Главный экран.',
      address: HomeScreenDef.at({}),
    },
    other: {
      label: 'Другой',
      description: 'Другой экран.',
      address: OtherScreenDef.at({}),
    },
    blank: {
      label: 'Пустой',
      description: 'Пустой экран.',
      address: BlankScreenDef.at({}),
    },
  },
});

const views = AppChatViews.ofSet(ConvSetDef, [
  ChatViews.of(ConvUiModuleDef, [
    ScreenPresenter.for(
      HomeScreenDef,
      ({ data, state }) =>
        `Главная: задач ${data?.count ?? 0}, отметок ${state?.ticks ?? 0}`,
    ),
    ScreenPresenter.for(OtherScreenDef, () => 'Другой экран'),
    ScreenPresenter.for(BlankScreenDef, () => ''),
  ]),
]);

/** Строки выхода `listTasks`: число задач — в тексте главного экрана. */
const rows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    uuid: testUuid(100 + i),
    title: `Задача ${i}`,
    status: 'open',
  }));

/** Сигнал перечитывания по событию — как от сервера: след события. */
const refreshSignal = (eventId: string): RefreshSignal => ({
  event: 'taskCreated',
  eventId,
  trace: Trace.fromEvent({ eventId, correlationId: eventId }).toJSON(),
});

/**
 * Подставной мессенджер с отказами порта: ответ на нажатие не доставляется,
 * показ и правка по инициативе бросают (дефект порта).
 */
class FaultyMessenger extends MemoryMessenger {
  constructor(
    private readonly faults: {
      readonly answer?: boolean;
      readonly initiative?: boolean;
    },
  ) {
    super({ capabilities: MemoryMessenger.editing().capabilities });
  }

  override async answer(
    peer: string,
    press: string,
    text?: string,
  ): Promise<Delivery<void>> {
    if (this.faults.answer === true) this.failNext('unavailable');
    return super.answer(peer, press, text);
  }

  override async show(
    peer: string,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<MessageHandle>> {
    if (this.faults.initiative === true && send?.initiative === true) {
      throw new Error('show-mark-q7');
    }
    return super.show(peer, message, send);
  }

  override async update(
    peer: string,
    handle: MessageHandle,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<Updated>> {
    if (this.faults.initiative === true && send?.initiative === true) {
      throw new Error('update-mark-q7');
    }
    return super.update(peer, handle, message, send);
  }
}

/** Беседа на исполнителе с заглушками; эпохи ссылок — от теста; `snapshot` — беседа после перезапуска. */
const sceneOf = (
  options: {
    readonly messenger?: MemoryMessenger;
    readonly home?: string;
    readonly snapshot?: ConversationSnapshot;
    readonly views?: AppChatViews;
  } = {},
) => {
  const kit = new RuntimeKit(
    AppCodeLoaders.ofSet(ConvSetDef, [
      CodeLoaders.of(ConvUiModuleDef, [
        CodeLoader.screen(HomeScreenDef, async () => new HomeCode()),
        CodeLoader.screen(OtherScreenDef, async () => new OtherCode()),
        CodeLoader.screen(BlankScreenDef, async () => new BlankCode()),
      ]),
    ]),
  );
  kit.ucs.answer(ListTasksUcDef, ok(rows(2)));
  kit.ucs.answer(CompleteTaskUcDef, ok({}));
  const messenger = options.messenger ?? MemoryMessenger.editing();
  const logger = new MemoryLogger();
  let requests = 0;
  let epochs = 0;
  const conversation = new Conversation(
    {
      app: ConvAppDef,
      runtime: kit.runtime,
      contexts: { context: async () => testRenderContext },
      traces: new DialogTraces(() => {
        requests += 1;
        return `r-${requests}`;
      }),
      views: options.views ?? views,
      messenger,
      logger,
      peer: PEER,
      person: A,
      home: options.home ?? 'start',
      epochs: () => {
        epochs += 1;
        return `ep${String(epochs).padStart(3, '0')}`;
      },
    },
    options.snapshot,
  );
  let ids = 0;
  const head = () => {
    ids += 1;
    return { id: `s-${ids}`, peer: PEER, sender: 'sender-a' };
  };
  const signals = {
    enter: (entry: string): ConversationSignal => ({
      ...head(),
      kind: 'enter',
      entry,
    }),
    press: (ref: string, press = `p-${ids + 1}`): ConversationSignal => ({
      ...head(),
      kind: 'press',
      ref,
      press,
    }),
    cancel: (): ConversationSignal => ({ ...head(), kind: 'cancel' }),
    attachment: (): ConversationSignal => ({
      ...head(),
      kind: 'attachment',
      attachment: { kind: 'image', handle: 'h-1' },
    }),
  };
  return { kit, messenger, logger, conversation, signals };
};

type Sent = Extract<MessengerEntry, { op: 'sent' }>;

/** Видимое содержимое: новое сообщение или правка на месте. */
type Shown = Extract<MessengerEntry, { op: 'sent' | 'edited' }>;

const sent = (messenger: MemoryMessenger): Sent[] =>
  messenger.journal.filter((entry): entry is Sent => entry.op === 'sent');

const visible = (messenger: MemoryMessenger): Shown[] =>
  messenger.journal.filter(
    (entry): entry is Shown => entry.op === 'sent' || entry.op === 'edited',
  );

const lastSent = (messenger: MemoryMessenger): Sent => {
  const entry = sent(messenger).at(-1);
  if (entry === undefined) throw new Error('сообщений нет');
  return entry;
};

/** Последнее, что показано: новое сообщение или правка на месте. */
const lastShown = (messenger: MemoryMessenger): Shown => {
  const entry = visible(messenger).at(-1);
  if (entry === undefined) throw new Error('сообщений нет');
  return entry;
};

const text = (entry: Shown) => PlainText.of(entry.message.text);

const labels = (entry: Shown) => entry.message.options.map((o) => o.label);

/** Ссылка варианта `label` из самого свежего показа, где он есть. */
const refOf = (messenger: MemoryMessenger, label: string): string => {
  for (const entry of [...visible(messenger)].reverse()) {
    const option = entry.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

/** id нажатий, на которые ушёл ответ, по порядку. */
const answered = (messenger: MemoryMessenger) =>
  messenger.journal.flatMap((entry) =>
    entry.op === 'answered' ? [entry.press] : [],
  );

const acted = (kit: RuntimeKit) =>
  kit.observer.records.filter((r) => r.kind === 'acted').length;

const completed = (kit: RuntimeKit) =>
  kit.ucs.names().filter((name) => name === 'completeTask').length;

describe('Conversation — вход и нажатие по записи', () => {
  test('вход приложения — экран сообщением через порт, варианты — ссылки таблицы', async () => {
    const s = sceneOf();

    const accepted = await s.conversation.receive(s.signals.enter('start'));

    expect(accepted).toBe(true);
    expect(s.messenger.journal).toHaveLength(1);
    const shown = lastSent(s.messenger);
    expect(shown).toMatchObject({ via: 'show', peer: PEER });
    expect(text(shown)).toBe('Главная: задач 2, отметок 0');
    expect(labels(shown)).toEqual(['Сохранить', 'Дальше', 'Отметить']);
    const refs = shown.message.options.map((o) => o.ref);
    expect(new Set(refs).size).toBe(3);
    for (const ref of refs) expect(ref).toMatch(/^[a-z0-9]{1,16}$/);
    expect(s.conversation.snapshot().refs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ref: refs[0],
          kind: 'action',
          action: 'save',
        }),
        expect.objectContaining({
          ref: refs[1],
          kind: 'action',
          action: 'leave',
        }),
        expect.objectContaining({ ref: refs[2], kind: 'local', local: 'tick' }),
      ]),
    );
    expect(s.conversation.screen()?.address.screen).toBe(HOME);
  });

  test('неизвестный вход — заметка «Такого входа нет.», не бросок', async () => {
    const s = sceneOf();

    await s.conversation.receive(s.signals.enter('nowhere'));

    expect(sent(s.messenger).map(text)).toEqual(['Такого входа нет.']);
    expect(labels(lastSent(s.messenger))).toEqual([]);
    expect(s.conversation.screen()).toBeUndefined();
  });

  test('вход constructor — «Такого входа нет.»: имя из прототипа — не вход', async () => {
    const s = sceneOf();

    for (const name of ['constructor', 'toString', '__proto__']) {
      await s.conversation.receive(s.signals.enter(name));
    }

    expect(sent(s.messenger).map(text)).toEqual([
      'Такого входа нет.',
      'Такого входа нет.',
      'Такого входа нет.',
    ]);
    expect(s.logger.records).toEqual([]);
    expect(s.conversation.screen()).toBeUndefined();
  });

  test('нажатие — действие исполнено и ровно один ответ на нажатие', async () => {
    const s = sceneOf();
    await s.conversation.receive(s.signals.enter('start'));

    await s.conversation.receive(
      s.signals.press(refOf(s.messenger, 'Сохранить'), 'p-save'),
    );

    expect(completed(s.kit)).toBe(1);
    expect(answered(s.messenger)).toEqual(['p-save']);
    expect(s.messenger.journal.at(-1)).toEqual({
      op: 'answered',
      peer: PEER,
      press: 'p-save',
    });
    expect(text(lastShown(s.messenger))).toBe('Главная: задач 2, отметок 0');
  });

  test('неизвестная ссылка — «Эта кнопка устарела.» и ответ на нажатие', async () => {
    const s = sceneOf();
    await s.conversation.receive(s.signals.enter('start'));

    await s.conversation.receive(s.signals.press('zzzzz9', 'p-unknown'));

    // У мессенджера с ответом на нажатие реакция — текст ответа, без сообщения.
    expect(sent(s.messenger)).toHaveLength(1);
    expect(s.messenger.journal.at(-1)).toEqual({
      op: 'answered',
      peer: PEER,
      press: 'p-unknown',
      text: 'Эта кнопка устарела.',
    });
    expect(answered(s.messenger)).toEqual(['p-unknown']);
    expect(acted(s.kit)).toBe(0);
  });

  test('ссылка закрытого экрана — «Эта кнопка устарела.», ядро не вызвано', async () => {
    const s = sceneOf();
    await s.conversation.receive(s.signals.enter('start'));
    const save = refOf(s.messenger, 'Сохранить');
    await s.conversation.receive(s.signals.press(refOf(s.messenger, 'Дальше')));
    const moved = text(lastShown(s.messenger));
    const journal = s.messenger.journal.length;

    await s.conversation.receive(s.signals.press(save, 'p-closed'));

    expect(moved).toBe('Другой экран');
    // Реакция на нажатие — текст ответа; показанное не меняется.
    expect(s.messenger.journal.slice(journal)).toEqual([
      {
        op: 'answered',
        peer: PEER,
        press: 'p-closed',
        text: 'Эта кнопка устарела.',
      },
    ]);
    expect(text(lastShown(s.messenger))).toBe('Другой экран');
    expect(acted(s.kit)).toBe(1);
    expect(completed(s.kit)).toBe(0);
    expect(s.conversation.screen()?.address.screen).toBe('convUi/conv/other');
  });

  test('устаревшая ссылка действия — вид с пометкой «Экран обновился.», UC не вызван', async () => {
    const s = sceneOf();
    await s.conversation.receive(s.signals.enter('start'));
    const save = refOf(s.messenger, 'Сохранить');
    s.kit.refresh.emit(refreshSignal('e-1'));
    await s.conversation.settled();

    await s.conversation.receive(s.signals.press(save));

    const last = lastShown(s.messenger);
    expect(text(last)).toBe('Экран обновился.\n\nГлавная: задач 2, отметок 0');
    expect(labels(last)).toEqual(['Сохранить', 'Дальше', 'Отметить']);
    expect(last.message.options.map((o) => o.ref)).not.toContain(save);
    expect(completed(s.kit)).toBe(0);
  });

  test('устаревшая ссылка локального действия — та же пометка, состояние не изменилось', async () => {
    const s = sceneOf();
    await s.conversation.receive(s.signals.enter('start'));
    const tick = refOf(s.messenger, 'Отметить');
    s.kit.refresh.emit(refreshSignal('e-1'));
    await s.conversation.settled();

    await s.conversation.receive(s.signals.press(tick));
    const stale = text(lastShown(s.messenger));
    const state = s.conversation.screen()?.state;
    await s.conversation.receive(
      s.signals.press(refOf(s.messenger, 'Отметить')),
    );

    expect(stale).toBe('Экран обновился.\n\nГлавная: задач 2, отметок 0');
    expect(state).toEqual({ ticks: 0 });
    expect(text(lastShown(s.messenger))).toBe('Главная: задач 2, отметок 1');
  });
});

describe('Conversation — очередь и отсев повтора', () => {
  test('сигналы одной беседы строго по одному: второй сигнал ждёт UC первого', async () => {
    const s = sceneOf();
    const atUc = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<SerializedResult>();
    s.kit.ucs.answer(CompleteTaskUcDef, () => {
      atUc.resolve();
      return gate.promise;
    });
    await s.conversation.receive(s.signals.enter('start'));

    const first = s.conversation.receive(
      s.signals.press(refOf(s.messenger, 'Сохранить'), 'p-first'),
    );
    await atUc.promise;
    const second = s.conversation.receive(
      s.signals.press('zzzzz9', 'p-second'),
    );
    gate.resolve(ok({}));
    await Promise.all([first, second]);

    expect(
      s.messenger.journal.map((entry) =>
        entry.op === 'sent' || entry.op === 'edited'
          ? `${entry.op}: ${text(entry)}`
          : entry.op === 'answered'
            ? `answered: ${entry.press}${entry.text === undefined ? '' : ` — ${entry.text}`}`
            : entry.op,
      ),
    ).toEqual([
      'sent: Главная: задач 2, отметок 0',
      'edited: Главная: задач 2, отметок 0',
      'answered: p-first',
      'answered: p-second — Эта кнопка устарела.',
    ]);
  });

  test('повтор сигнала по id — действие одно, второго ответа и сообщения нет', async () => {
    const s = sceneOf();
    await s.conversation.receive(s.signals.enter('start'));
    const save = s.signals.press(refOf(s.messenger, 'Сохранить'), 'p-save');
    const first = await s.conversation.receive(save);
    const journal = s.messenger.journal.length;

    const repeated = await s.conversation.receive(save);

    expect(first).toBe(true);
    expect(repeated).toBe(false);
    expect(s.messenger.journal).toHaveLength(journal);
    expect(completed(s.kit)).toBe(1);
    expect(answered(s.messenger)).toEqual(['p-save']);
  });
});

describe('Conversation — отказы порта мессенджера', () => {
  test('недоставка ответа на нажатие — warn без данных, беседа идёт дальше', async () => {
    const s = sceneOf({ messenger: new FaultyMessenger({ answer: true }) });
    await s.conversation.receive(s.signals.enter('start'));

    await s.conversation.receive(
      s.signals.press(refOf(s.messenger, 'Отметить'), 'p-tick-1'),
    );
    await s.conversation.receive(
      s.signals.press(refOf(s.messenger, 'Отметить'), 'p-tick-2'),
    );

    expect(text(lastShown(s.messenger))).toBe('Главная: задач 2, отметок 2');
    const undelivered = {
      level: 'warn' as const,
      source: 'chat-ui',
      message: expect.any(String),
      meta: {
        messenger: 'memory-editing',
        operation: 'answer',
        reason: 'unavailable',
      },
    };
    expect(s.logger.records).toEqual([undelivered, undelivered]);
    expect(JSON.stringify(s.logger.records)).not.toContain('p-tick');
  });

  test('дефект проактивного показа — error без данных, процесс не падает, беседа идёт дальше', async () => {
    const s = sceneOf({ messenger: new FaultyMessenger({ initiative: true }) });
    await s.conversation.receive(s.signals.enter('start'));

    s.kit.refresh.emit(refreshSignal('e-1'));
    await s.conversation.settled();
    await s.conversation.receive(s.signals.cancel());

    expect(s.logger.records).toEqual([
      {
        level: 'error',
        source: 'chat-ui',
        message: expect.any(String),
        meta: {
          messenger: 'memory-editing',
          operation: 'refresh',
          name: 'Error',
        },
      },
    ]);
    expect(JSON.stringify(s.logger.records)).not.toContain('mark-q7');
    expect(sent(s.messenger).map(text)).toEqual([
      'Главная: задач 2, отметок 0',
      'Главная: задач 2, отметок 0',
    ]);
  });
});

describe('Conversation — экран снимка', () => {
  test('представление бросает при подъёме экрана снимка — дефект, экран остаётся в снимке, экземпляр закрыт; после починки сигнал экран поднимает', async () => {
    let broken = false;
    const fragile = AppChatViews.ofSet(ConvSetDef, [
      ChatViews.of(ConvUiModuleDef, [
        ScreenPresenter.for(HomeScreenDef, ({ data }) => {
          if (broken) throw new Error('render-mark-q7');
          return `Главная: задач ${data?.count ?? 0}`;
        }),
        ScreenPresenter.for(OtherScreenDef, () => 'Другой экран'),
        ScreenPresenter.for(BlankScreenDef, () => ''),
      ]),
    ]);
    const first = sceneOf({ views: fragile });
    await first.conversation.receive(first.signals.enter('start'));
    const saved = first.conversation.snapshot();
    first.conversation.close();
    const s = sceneOf({ snapshot: saved, views: fragile });
    // Шпион восстановления: какие экземпляры подняты и закрыты ли они.
    const restored: { closed: boolean }[] = [];
    const restore = s.kit.runtime.restore.bind(s.kit.runtime);
    s.kit.runtime.restore = async (json, options) => {
      const result = await restore(json, options);
      if (!result.ok) return result;
      const mark = { closed: false };
      restored.push(mark);
      const close = result.value.close.bind(result.value);
      result.value.close = () => {
        mark.closed = true;
        close();
      };
      return result;
    };

    broken = true;
    // id сигналов сцены начинаются заново: свои id, чтобы отсев не съел сигнал.
    const failed = s.conversation.receive({
      ...s.signals.cancel(),
      id: 's-broken',
    });
    await expect(failed).rejects.toThrow('render-mark-q7');
    const kept = s.conversation.snapshot();
    broken = false;
    await s.conversation.receive({ ...s.signals.cancel(), id: 's-fixed' });

    expect(kept.screen).toEqual(saved.screen);
    expect(restored).toEqual([{ closed: true }, { closed: false }]);
    expect(sent(s.messenger).map(text)).toEqual(['Главная: задач 2']);
    expect(s.conversation.screen()?.address.screen).toBe(HOME);
    expect(s.conversation.snapshot().screen?.serial).toBe(saved.screen?.serial);
  });
});

describe('Conversation — проактивный показ', () => {
  test('перечитывание по событию — сообщение по инициативе; после окна — undelivered(window) и warn без данных', async () => {
    let now = 0;
    const s = sceneOf({ messenger: MemoryMessenger.windowed(() => now) });
    await s.conversation.receive(s.signals.enter('start'));

    s.kit.ucs.answer(ListTasksUcDef, ok(rows(1)));
    s.kit.refresh.emit(refreshSignal('e-1'));
    await s.conversation.settled();
    const inWindow = lastSent(s.messenger);
    now = DAY_MS + 1;
    s.kit.ucs.answer(ListTasksUcDef, ok(rows(0)));
    s.kit.refresh.emit(refreshSignal('e-2'));
    await s.conversation.settled();
    const late = s.messenger.journal.at(-1);
    await s.conversation.receive(s.signals.cancel());

    expect(text(inWindow)).toBe('Главная: задач 1, отметок 0');
    // Место последнее — проактивный показ идёт правкой (`update`) по инициативе.
    expect(late).toEqual({
      op: 'undelivered',
      via: 'update',
      peer: PEER,
      reason: 'window',
    });
    expect(s.logger.records).toEqual([
      {
        level: 'warn',
        source: 'chat-ui',
        message: expect.any(String),
        meta: {
          messenger: 'memory-windowed',
          operation: 'update',
          reason: 'window',
        },
      },
    ]);
    expect(JSON.stringify(s.logger.records)).not.toContain(PEER);
    // Ответ на сигнал собеседника — не по инициативе: доставлен и после окна.
    expect(text(lastSent(s.messenger))).toBe('Главная: задач 0, отметок 0');
  });
});

describe('Conversation — сигналы без действия', () => {
  test('вложение — заметка «Вложения здесь не принимаются.», до действия не доходит', async () => {
    const s = sceneOf();
    await s.conversation.receive(s.signals.enter('start'));

    await s.conversation.receive(s.signals.attachment());

    expect(text(lastSent(s.messenger))).toBe('Вложения здесь не принимаются.');
    expect(labels(lastSent(s.messenger))).toEqual([]);
    expect(acted(s.kit)).toBe(0);
    expect(s.conversation.screen()?.address.screen).toBe(HOME);
  });

  test('отмена без черновика — живой экран снова', async () => {
    const s = sceneOf();
    await s.conversation.receive(s.signals.enter('start'));
    const before = lastSent(s.messenger);

    await s.conversation.receive(s.signals.cancel());

    expect(sent(s.messenger)).toHaveLength(2);
    expect(text(lastSent(s.messenger))).toBe(text(before));
    expect(labels(lastSent(s.messenger))).toEqual(labels(before));
    expect(acted(s.kit)).toBe(0);
  });

  test('отмена без живого экрана — ничего не показывается', async () => {
    const s = sceneOf();

    await s.conversation.receive(s.signals.cancel());

    expect(s.messenger.journal).toEqual([]);
    expect(s.conversation.screen()).toBeUndefined();
  });

  test('пустое сообщение в порт не уходит', async () => {
    const s = sceneOf();

    await s.conversation.receive(s.signals.enter('blank'));

    expect(s.messenger.journal).toEqual([]);
    expect(s.logger.records).toEqual([]);
    expect(s.conversation.screen()?.address.screen).toBe(BLANK);
  });
});

describe('Conversation — сборка', () => {
  const editing = MemoryMessenger.editing().capabilities;
  const withOptions = (options: Partial<OptionLimits>) =>
    new MemoryMessenger({
      capabilities: {
        ...editing,
        options: { ...editing.options, ...options },
      },
    });

  test('сборка: options.max < 3 или options.ref < 16 — бросок; на пределе — собирается', () => {
    expect(() => sceneOf({ messenger: withOptions({ max: 2 }) })).toThrow();
    expect(() => sceneOf({ messenger: withOptions({ ref: 15 }) })).toThrow();
    expect(() =>
      sceneOf({ messenger: withOptions({ max: 3, ref: 16 }) }),
    ).not.toThrow();
  });

  test('сборка: нет входа home — бросок', () => {
    expect(() => sceneOf({ home: 'nowhere' })).toThrow();
  });
});
