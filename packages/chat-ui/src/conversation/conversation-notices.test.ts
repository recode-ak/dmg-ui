import { describe, expect, test } from 'bun:test';
import { ok, Trace } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { ListAssignedTasksUcDef, TaskEvents } from 'dmg-core/testing/example';
import { ExampleDialogUiAppDef, exampleDialogViews } from 'dmg-ui/example';
import type { DeliveredNotification } from 'dmg-ui/server';
import { RuntimeKit, T0, testRenderContext } from 'dmg-ui/testing/fixtures';
import { MemoryMessenger, type MessengerEntry } from '../../testing';
import { DialogTraces } from '../dialog/dialog-traces';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import { LimitedMessenger } from '../messenger/limited-messenger';
import type {
  Delivery,
  MessageHandle,
  MessengerCapabilities,
} from '../messenger/messenger.types';
import { VIEW_TEXTS } from '../view/view.const';
import { Conversation } from './conversation';
import {
  CONVERSATION_TEXTS,
  MAX_NOTIFIED,
  MAX_REFS,
} from './conversation.const';
import type { ConversationSnapshot } from './conversation.types';

// Входящее уведомление в беседе: сообщение собеседнику по порту `notify`,
// ссылки — записи `open` таблицы, отсев повтора по событию-причине в снимке,
// недошедшее без отсева и без следов в таблице. Беседа — на заглушках портов
// и учебном наборе, порт обёрнут стражем, как в узле бесед. Проверки — по
// журналу подставного мессенджера, снимку и логу.

const A = testUuid(1);
const PEER = 'peer-a';
const DAY_MS = 86_400_000;
const LIST = 'exampleUi/todo/taskList';
const ASSIGNED = 'exampleUi/todo/assignedTasks';
const MORE = VIEW_TEXTS.more;

/** Подставной мессенджер, который помнит сообщения, пришедшие на `notify` (в том числе недошедшие). */
class RecordingMessenger extends MemoryMessenger {
  readonly notified: Message[] = [];
  /** Порт бросает на `notify` (дефект порта). */
  broken: Error | undefined;

  override async notify(
    peer: string,
    message: Message,
  ): Promise<Delivery<MessageHandle>> {
    this.notified.push(message);
    if (this.broken !== undefined) throw this.broken;
    return super.notify(peer, message);
  }
}

const recording = (capabilities: MessengerCapabilities, clock: () => number) =>
  new RecordingMessenger({ capabilities, clock });

const MESSENGERS = [
  [
    'editing',
    (clock: () => number) =>
      recording(MemoryMessenger.editing().capabilities, clock),
  ],
  [
    'windowed',
    (clock: () => number) =>
      recording(MemoryMessenger.windowed(clock).capabilities, clock),
  ],
] as const;

/** Уведомление «назначена задача» для A по событию `eventId`; `over` подменяет поля. */
const assigned = (
  eventId: string,
  over: Partial<DeliveredNotification> = {},
): DeliveredNotification => ({
  notification: 'exampleUi/todo/taskAssigned',
  recipient: A,
  data: { title: 'Сыр' },
  links: [{ screen: ASSIGNED, params: {} }],
  cause: { event: TaskEvents.assigned.name, eventId },
  trace: Trace.fromEvent({ eventId, correlationId: 'r-assign' }).toJSON(),
  ...over,
});

/** Беседа на заглушках; `clock` — часы окна инициативы подставного мессенджера. */
const sceneOf = (
  make: (clock: () => number) => RecordingMessenger,
  options: { readonly snapshot?: ConversationSnapshot } = {},
) => {
  const clock = { now: T0 };
  const messenger = make(() => clock.now);
  const kit = new RuntimeKit();
  kit.ucs.answer(ListAssignedTasksUcDef, ok([]));
  const logger = new MemoryLogger();
  let requests = 0;
  let epochs = 0;
  const conversation = new Conversation(
    {
      app: ExampleDialogUiAppDef,
      runtime: kit.runtime,
      contexts: { context: async () => testRenderContext },
      traces: new DialogTraces(() => {
        requests += 1;
        return `r-${requests}`;
      }),
      views: exampleDialogViews(ExampleDialogUiAppDef),
      messenger: new LimitedMessenger({ port: messenger, logger }),
      logger,
      peer: PEER,
      person: A,
      home: 'start',
      epochs: () => {
        epochs += 1;
        return `nt${String(epochs).padStart(3, '0')}`;
      },
    },
    options.snapshot,
  );
  let ids = 0;
  const head = () => {
    ids += 1;
    return {
      id: `${options.snapshot === undefined ? 's' : 'r'}-${ids}`,
      peer: PEER,
      sender: 'sender-a',
    };
  };
  const enter = (entry: string) =>
    conversation.receive({ ...head(), kind: 'enter', entry });
  const cancel = () => conversation.receive({ ...head(), kind: 'cancel' });
  const pressRef = (ref: string) =>
    conversation.receive({ ...head(), kind: 'press', ref, press: `p-${ids}` });

  /** Ссылка варианта `label` из самого свежего сообщения беседы, где он есть. */
  const find = (label: string): string | undefined => {
    for (const line of [...messenger.chat(PEER)].reverse()) {
      const option = line.message.options.find((o) => o.label === label);
      if (option !== undefined) return option.ref;
    }
    return undefined;
  };

  /** Нажать вариант `label`; у мессенджера с тремя вариантами — листая «Ещё». */
  const press = async (label: string): Promise<void> => {
    for (let page = 0; page < 8; page += 1) {
      const ref = find(label);
      if (ref !== undefined) {
        await pressRef(ref);
        return;
      }
      const more = find(MORE);
      if (more === undefined) break;
      await pressRef(more);
    }
    throw new Error(`нет варианта «${label}»`);
  };

  /** Живой экран открыт, начат ввод на карточке: есть экран, путь и черновик. */
  const busy = async (): Promise<void> => {
    await enter('start');
    await press('Хлеб');
    await press('Назначить');
  };

  return {
    clock,
    messenger,
    logger,
    conversation,
    enter,
    cancel,
    press,
    pressRef,
    busy,
    notify: (n: DeliveredNotification) => conversation.notify(n),
    /** Окно закрыто (контакт давний) или следующая операция не дойдёт. */
    refuse: () => {
      if (messenger.capabilities.edit) messenger.failNext('unavailable');
      else clock.now += DAY_MS + 1;
    },
    /** Недоставка прошла: окно открыто собеседником. */
    reopen: () => messenger.heard(PEER),
  };
};

type Sent = Extract<MessengerEntry, { op: 'sent' }>;

/** Сообщения, дошедшие по `notify`. */
const notices = (messenger: MemoryMessenger): Sent[] =>
  messenger.journal.filter(
    (entry): entry is Sent => entry.op === 'sent' && entry.via === 'notify',
  );

const textOf = (message: Message) => PlainText.of(message.text);

/** Снимок без частей, которые уведомление меняет: таблица ссылок, отсев, положение места. */
const untouched = (snapshot: ConversationSnapshot) => ({
  ...snapshot,
  refs: undefined,
  notified: undefined,
  screen:
    snapshot.screen === undefined
      ? undefined
      : { ...snapshot.screen, latest: undefined },
});

/** Снимок с явным отсевом: пустой отсев поле может не писать. */
const withNotified = (snapshot: ConversationSnapshot) => ({
  ...snapshot,
  notified: snapshot.notified ?? [],
});

/** Отсев в снимке: поле необязательное. */
const notifiedOf = (conversation: Conversation): readonly string[] =>
  conversation.snapshot().notified ?? [];

describe.each(MESSENGERS)('уведомление беседы (%s)', (name, make) => {
  const editing = name === 'editing';

  test('уведомление идёт порту notify: текст — представления, вариант — на экран-цель с подписью экрана', async () => {
    const s = sceneOf(make);
    await s.enter('start');

    const delivered = await s.notify(assigned('e-1'));

    expect(delivered).toBe(true);
    const [notice, ...rest] = notices(s.messenger);
    expect(rest).toEqual([]);
    if (notice === undefined) throw new Error('уведомление не дошло');
    expect(notice.peer).toBe(PEER);
    expect(textOf(notice.message)).toBe('Вам назначена задача: Сыр');
    expect(notice.message.options.map((o) => o.label)).toEqual([
      'Назначенные мне',
    ]);
    const ref = notice.message.options[0]?.ref;
    if (ref === undefined) throw new Error('у уведомления нет ссылки');
    expect(ref).toMatch(/^[a-z0-9]{1,16}$/);
    expect(s.conversation.snapshot().refs).toContainEqual({
      ref,
      kind: 'open',
      address: { screen: ASSIGNED, params: {} },
      label: 'Назначенные мне',
    });
    expect(s.logger.records).toEqual([]);
  });

  test('ссылка на экран вне набора — подпись «Открыть»', async () => {
    const s = sceneOf(make);
    await s.enter('start');

    await s.notify(
      assigned('e-1', {
        links: [{ screen: 'exampleUi/todo/unknown', params: {} }],
      }),
    );

    const [notice] = notices(s.messenger);
    expect(notice?.message.options.map((o) => o.label)).toEqual([
      VIEW_TEXTS.open,
    ]);
  });

  test('уведомление не трогает беседу: экран, черновик, путь и номер прежние; меняются таблица ссылок, отсев и положение', async () => {
    const s = sceneOf(make);
    await s.busy();
    const before = s.conversation.snapshot();

    await s.notify(assigned('e-1'));

    const after = s.conversation.snapshot();
    expect(before.screen).toBeDefined();
    expect(before.draft).toBeDefined();
    expect(before.path).toBeDefined();
    expect(before.screen?.latest).toBe(true);
    expect(untouched(after)).toEqual(untouched(before));
    expect(after.screen?.latest).toBeFalsy();
    expect(after.refs).toHaveLength(before.refs.length + 1);
    expect([...after.refs.slice(0, before.refs.length)]).toEqual([
      ...before.refs,
    ]);
    expect(notifiedOf(s.conversation)).toHaveLength(1);
  });

  test('ссылка уведомления: нажатие открывает экран новым сообщением, прежнее место уходит; путь растёт, «Назад» возвращает', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    const place = s.conversation.snapshot().screen?.handles ?? [];
    await s.notify(assigned('e-1'));
    const mark = s.messenger.journal.length;
    const link = s.messenger.notified[0]?.options[0]?.ref;
    if (link === undefined) throw new Error('у уведомления нет ссылки');

    await s.pressRef(link);

    const moved = s.conversation.snapshot();
    const fresh = s.messenger.journal.slice(mark);
    expect(place.length).toBeGreaterThan(0);
    expect(fresh.some((entry) => entry.op === 'edited')).toBe(false);
    expect(
      fresh.some((entry) => entry.op === 'sent' && entry.via !== 'notify'),
    ).toBe(true);
    const retired = fresh.filter((entry) => entry.op === 'retired');
    if (editing) {
      expect(retired.map((entry) => entry.handle)).toEqual([...place]);
      expect(retired.every((entry) => entry.chosen === undefined)).toBe(true);
    } else {
      expect(retired).toEqual([]);
    }
    expect(moved.screen?.instance).toMatchObject({
      address: { screen: ASSIGNED },
    });
    expect(moved.path).toMatchObject([{ address: { screen: LIST } }]);

    await s.press('Назад');

    const back = s.conversation.snapshot();
    expect(back.screen?.instance).toMatchObject({ address: { screen: LIST } });
    expect(back.path).toBeUndefined();
  });

  test('ссылка вытеснена из таблицы — «Эта кнопка устарела.», экран прежний', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    await s.notify(assigned('e-0'));
    const first = s.messenger.notified[0]?.options[0]?.ref;
    if (first === undefined) throw new Error('у уведомления нет ссылки');
    for (let i = 1; i <= MAX_REFS; i += 1) await s.notify(assigned(`e-${i}`));
    const before = s.conversation.snapshot();
    expect(before.refs.some((entry) => entry.ref === first)).toBe(false);
    const mark = s.messenger.journal.length;

    await s.pressRef(first);

    const fresh = s.messenger.journal.slice(mark);
    const reaction = fresh.find(
      (entry) =>
        (entry.op === 'answered' && entry.text !== undefined) ||
        (entry.op === 'sent' && textOf(entry.message).length > 0),
    );
    if (reaction?.op === 'answered') {
      expect(reaction.text).toBe(CONVERSATION_TEXTS.unknownRef);
    } else if (reaction?.op === 'sent') {
      expect(textOf(reaction.message)).toBe(CONVERSATION_TEXTS.unknownRef);
    } else {
      throw new Error('реакции на устаревшую ссылку нет');
    }
    expect(s.conversation.snapshot().screen?.instance).toEqual(
      before.screen?.instance,
    );
  });

  test('после уведомления показ экрана — новым сообщением, а не правкой', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    const mark = s.messenger.journal.length;
    await s.press('Отметить задачу');
    const ops = s.messenger.journal.slice(mark).map((entry) => entry.op);
    // Без уведомления нажатие правит сообщение места на месте.
    expect(ops.includes('edited')).toBe(editing);
    expect(ops.includes('sent')).toBe(!editing);
    await s.notify(assigned('e-1'));
    const after = s.messenger.journal.length;

    await s.press('Хлеб');

    const fresh = s.messenger.journal.slice(after);
    expect(fresh.some((entry) => entry.op === 'edited')).toBe(false);
    expect(
      fresh.some((entry) => entry.op === 'sent' && entry.via !== 'notify'),
    ).toBe(true);
  });

  test('повтор по событию-причине отсеян; другое событие — новое сообщение', async () => {
    const s = sceneOf(make);
    await s.enter('start');

    const first = await s.notify(assigned('e-1'));
    const repeat = await s.notify(assigned('e-1'));
    const afterRepeat = notices(s.messenger).length;
    const refs = s.conversation.snapshot().refs.length;
    const other = await s.notify(assigned('e-2'));

    expect([first, repeat, other]).toEqual([true, false, true]);
    expect(afterRepeat).toBe(1);
    expect(notices(s.messenger)).toHaveLength(2);
    expect(s.conversation.snapshot().refs).toHaveLength(refs + 1);
  });

  test('предел отсева: сверх MAX_NOTIFIED вытесняется старейший (его повтор доходит), свежий отсеян', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    for (let i = 0; i < MAX_NOTIFIED; i += 1) {
      expect(await s.notify(assigned(`e-${i}`))).toBe(true);
    }
    expect(notifiedOf(s.conversation)).toHaveLength(MAX_NOTIFIED);

    expect(await s.notify(assigned(`e-${MAX_NOTIFIED}`))).toBe(true);
    expect(notifiedOf(s.conversation)).toHaveLength(MAX_NOTIFIED);
    expect(await s.notify(assigned(`e-${MAX_NOTIFIED}`))).toBe(false);
    expect(await s.notify(assigned('e-0'))).toBe(true);

    expect(notices(s.messenger)).toHaveLength(MAX_NOTIFIED + 2);
  });

  test('отсев переживает снимок и новое воплощение беседы; в снимке — хэш, а не id события', async () => {
    const first = sceneOf(make);
    await first.enter('start');
    await first.notify(assigned('ev-mark-k5-1'));
    const saved: ConversationSnapshot = JSON.parse(
      JSON.stringify(first.conversation.snapshot()),
    );
    first.conversation.close();

    const second = sceneOf(make, { snapshot: saved });
    // Новый мессенджер без контакта: окно открыто собеседником, иначе `false` — не отсев.
    second.reopen();
    const repeat = await second.notify(assigned('ev-mark-k5-1'));
    const fresh = await second.notify(assigned('ev-mark-k5-2'));

    expect(saved.notified).toHaveLength(1);
    expect(saved.notified?.[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(saved)).not.toContain('ev-mark-k5');
    expect([repeat, fresh]).toEqual([false, true]);
    expect(notices(second.messenger)).toHaveLength(1);
  });

  test('недошедшее — warn без броска, отсев не ставится: повтор после открытия окна доходит; положение места не сбито', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    const before = s.conversation.snapshot();
    s.refuse();

    const delivered = await s.notify(assigned('e-1'));

    expect(delivered).toBe(false);
    expect(s.logger.records).toEqual([
      {
        level: 'warn',
        source: 'chat-ui',
        message: expect.any(String),
        meta: {
          messenger: s.messenger.capabilities.name,
          operation: 'notify',
          reason: editing ? 'unavailable' : 'window',
        },
      },
    ]);
    expect(notices(s.messenger)).toEqual([]);
    expect(notifiedOf(s.conversation)).toEqual([]);
    expect(withNotified(s.conversation.snapshot())).toEqual(
      withNotified(before),
    );
    expect(before.screen?.latest).toBe(true);
    expect(s.conversation.snapshot().screen?.latest).toBe(true);

    s.reopen();
    const again = await s.notify(assigned('e-1'));

    expect(again).toBe(true);
    expect(notices(s.messenger)).toHaveLength(1);
  });

  test('недошедшее уведомление не оставляет ссылок в таблице: refs прежние, счётчик назад не идёт', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    const before = s.conversation.snapshot();
    s.refuse();

    await s.notify(assigned('e-1'));

    const dropped = s.messenger.notified[0]?.options[0]?.ref;
    if (dropped === undefined) throw new Error('сообщение не собрано');
    expect(s.conversation.snapshot().refs).toEqual(before.refs);

    s.reopen();
    await s.notify(assigned('e-1'));

    const later = s.messenger.notified[1]?.options[0]?.ref;
    if (later === undefined) throw new Error('повтор не собран');
    expect(later).not.toBe(dropped);
    expect(Number.parseInt(later.slice(5), 36)).toBeGreaterThan(
      Number.parseInt(dropped.slice(5), 36),
    );
  });

  test('бросок порта notify: ссылки сняты, отсев и положение места прежние, бросок идёт наружу', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    const before = s.conversation.snapshot();
    s.messenger.broken = new Error('port-mark-z3');

    await expect(s.notify(assigned('e-1'))).rejects.toThrow('port-mark-z3');

    const after = s.conversation.snapshot();
    expect(s.messenger.notified).toHaveLength(1);
    expect(after.refs).toEqual(before.refs);
    expect(notifiedOf(s.conversation)).toEqual([]);
    expect(after.screen?.latest).toBe(true);
    expect(withNotified(after)).toEqual(withNotified(before));
  });

  test('в лог недошедшего данные не идут', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    s.refuse();

    await s.notify(
      assigned('ev-mark-q7', {
        data: { title: 'title-mark-q7' },
        links: [{ screen: LIST, params: { page: 0 } }],
      }),
    );

    const dropped = s.messenger.notified[0]?.options[0]?.ref ?? 'нет-ссылки';
    const log = JSON.stringify(s.logger.records);
    expect(s.logger.records).toHaveLength(1);
    for (const mark of ['mark-q7', A, PEER, LIST, dropped, 'Мои задачи']) {
      expect(log).not.toContain(mark);
    }
  });

  test('ссылок больше options.max — лишние отрезает страж, запись стража без данных', async () => {
    const s = sceneOf(make);
    await s.enter('start');
    const { max } = s.messenger.capabilities.options;
    const links = [0, 1, 2, 3].map((page) => ({
      screen: LIST,
      params: { page },
    }));

    const delivered = await s.notify(assigned('e-1', { links }));

    const [notice] = notices(s.messenger);
    expect(delivered).toBe(true);
    expect(notice?.message.options).toHaveLength(Math.min(links.length, max));
    const cuts = s.logger.records.filter(
      (record) => record.meta?.operation === 'notify',
    );
    expect(cuts).toHaveLength(links.length > max ? 1 : 0);
    expect(cuts.every((record) => record.meta?.limit === 'options')).toBe(true);
  });
});
