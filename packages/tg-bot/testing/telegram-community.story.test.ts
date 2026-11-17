import { describe, expect, test } from 'bun:test';
import { ok, type SerializedResult } from 'dmg-core';
import type { EventEnvelope } from 'dmg-core/app';
import { AwaitingBus, MemoryLogger, testUuid } from 'dmg-core/testing';
import type { ExampleUser } from 'dmg-core/testing/example';
import {
  GetTaskUcDef,
  RemoveUserUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import {
  type ChatCommunitySpec,
  type ChatReactionSpec,
  type ChatSignalSpec,
  Communities,
} from 'dmg-ui/chat-ui';
import { ExampleDialogAppDef } from 'dmg-ui/chat-ui/testing';
import type { UcDispatch, UcRequest } from 'dmg-ui/server';
import { T0 } from 'dmg-ui/testing/fixtures';
import { TelegramMessenger, TelegramUpdates } from 'dmg-ui/tg-bot';
import * as v from 'valibot';
import { MemoryBotApi, TestUpdates } from '.';

// Сторис сообщества на Telegram: настоящие `Communities` и `TelegramMessenger`
// на подставном порту Bot API, апдейты — `TestUpdates` через
// `TelegramUpdates`. Проверки — в терминах Telegram: какой UC вызван и какие
// вызовы ушли в порт. Отсев повтора и очередь — зона `Communities`
// (`chat-ui`, TST-08): здесь только то, что они работают поверх порта
// Telegram. Без таймеров (TST-04): очередь — `MemoryBotApi.holdOn`.

const A = testUuid(1);
const B = testUuid(2);
const KEY1 = testUuid(11);
const KEY2 = testUuid(12);
const TASK1 = testUuid(21);
const TASK2 = testUuid(22);
const TASK3 = testUuid(23);
const MEMBER_A = 7350001234;
const MEMBER_B = 7350005678;
const ADMIN = 7350002222;
/** id самого бота (`getMe`). */
const BOT = 7350009000;
const GROUP1 = -1004001234567;
const GROUP2 = -1004007654321;
const NOW = 1_700_000_000_000;
const UNTIL = 1_700_000_300;

const JOINED: ChatSignalSpec = {
  name: 'joined',
  label: 'Участник вступил',
  description: 'Участник вступил в группу.',
  signal: 'joined',
  uc: RemoveUserUcDef,
  input: { userId: 'person', communityId: 'community' },
};
const LEFT: ChatSignalSpec = { ...JOINED, name: 'left', signal: 'left' };
const REQUESTED: ChatSignalSpec = {
  ...JOINED,
  name: 'requested',
  signal: 'requested',
};
const DROP: ChatReactionSpec = {
  name: 'drop',
  label: 'Исключить владельца',
  description: 'Владелец назначенной задачи исключается из группы.',
  event: TaskEvents.assigned,
  uc: GetTaskUcDef,
  input: { taskId: 'taskId' },
  operation: 'exclude',
  targets: { community: 'uuid', person: 'ownerId' },
};
const LET_IN: ChatReactionSpec = {
  ...DROP,
  name: 'letIn',
  label: 'Принять заявку',
  description: 'Владелец выполненной задачи принимается в группу.',
  event: TaskEvents.completed,
  operation: 'approve',
};
const COMMUNITY: ChatCommunitySpec = {
  signals: [JOINED, LEFT, REQUESTED],
  reactions: [DROP, LET_IN],
};

/** Строки задач: ключ сообщества — `uuid`, владелец — `ownerId`. */
const ROWS: Record<string, { uuid: string; ownerId: string }> = {
  [TASK1]: { uuid: KEY1, ownerId: A },
  [TASK2]: { uuid: KEY1, ownerId: B },
  [TASK3]: { uuid: KEY2, ownerId: A },
};

/** Бэкенд UC: пишет запросы; `getTask` отвечает строкой задачи, `removeUser` — ok. */
class StubDispatch implements UcDispatch<ExampleUser> {
  readonly requests: UcRequest<ExampleUser>[] = [];

  async dispatch(request: UcRequest<ExampleUser>): Promise<SerializedResult> {
    this.requests.push(request);
    if (request.uc.name === GetTaskUcDef.name) {
      const { taskId } = v.parse(
        v.object({ taskId: v.string() }),
        request.input,
      );
      return ok(ROWS[taskId]);
    }
    return ok({});
  }
}

/** Конверт события домена с id `eventId` по задаче `taskId`. */
const envelope = (
  event: typeof TaskEvents.assigned | typeof TaskEvents.completed,
  eventId: string,
  taskId: string,
): EventEnvelope => {
  const row = ROWS[taskId];
  return {
    name: event.name,
    payload:
      event === TaskEvents.assigned
        ? { taskId, ownerId: row?.ownerId, assigneeId: B }
        : { taskId, ownerId: row?.ownerId },
    eventId,
    occurredAt: T0,
    aggregateId: taskId,
    cause: { kind: 'request', requestId: `r-${eventId}` },
    correlationId: `r-${eventId}`,
  };
};

/** Мир: сообщество на Telegram; личности и группы — по таблицам теста. */
const world = () => {
  const bus = new AwaitingBus();
  const logger = new MemoryLogger();
  const api = new MemoryBotApi();
  const updates = new TestUpdates();
  const dispatch = new StubDispatch();
  const messenger = new TelegramMessenger({ api, logger, now: () => NOW });
  const people = new Map([
    [String(MEMBER_A), A],
    [String(MEMBER_B), B],
  ]);
  const members = new Map([
    [A, String(MEMBER_A)],
    [B, String(MEMBER_B)],
  ]);
  const keys = new Map([
    [String(GROUP1), KEY1],
    [String(GROUP2), KEY2],
  ]);
  const handles = new Map([
    [KEY1, String(GROUP1)],
    [KEY2, String(GROUP2)],
  ]);
  const communities = new Communities<ExampleUser>({
    app: ExampleDialogAppDef,
    community: COMMUNITY,
    messenger,
    dispatch,
    context: { bus, logger },
    people: async (member) => people.get(member),
    members: async (person) => members.get(person),
    keys: async (handle) => keys.get(handle),
    handles: async (key) => handles.get(key),
  });
  const telegram = new TelegramUpdates({
    conversations: { receive: async () => undefined },
    messenger,
    logger,
    entryPoints: [],
    bot: BOT,
    communities,
  });
  const stop = communities.start();
  return { api, bus, dispatch, logger, stop, telegram, updates };
};

/** Вызовы порта группы строками «метод чат участник». */
const calls = (api: MemoryBotApi, chat?: number): string[] =>
  api.journal.flatMap((call) => {
    if (call.method === 'sendMessage') return [];
    const params = call.params as { chat_id?: number; user_id?: number };
    if (params.chat_id === undefined) return [];
    if (chat !== undefined && params.chat_id !== chat) return [];
    return [`${call.method} ${params.chat_id} ${params.user_id}`];
  });

const ucs = (dispatch: StubDispatch) =>
  dispatch.requests.map((request) => [request.uc.name, request.input]);

describe('сообщество на Telegram — сигналы', () => {
  test('вступление человека (chat_member) — объявленный UC вызван системным вызывающим от узла сигнала; ключ и человек — из портов перевода', async () => {
    const { dispatch, telegram, updates } = world();

    await telegram.receive(updates.joined(GROUP1, MEMBER_A, ADMIN));

    expect(ucs(dispatch)).toEqual([
      [RemoveUserUcDef.name, { userId: A, communityId: KEY1 }],
    ]);
    expect(dispatch.requests[0]?.caller.toLog()).toMatchObject({
      kind: 'system',
      from: { name: 'exampleDialog/signal-joined' },
    });
  });

  test('выход человека и заявка на вступление вызывают свои сигналы', async () => {
    const { dispatch, telegram, updates } = world();

    await telegram.receive(updates.left(GROUP1, MEMBER_B, ADMIN));
    await telegram.receive(updates.joinRequest(GROUP2, MEMBER_A));

    expect(ucs(dispatch)).toEqual([
      [RemoveUserUcDef.name, { userId: B, communityId: KEY1 }],
      [RemoveUserUcDef.name, { userId: A, communityId: KEY2 }],
    ]);
    expect(
      dispatch.requests.map((request) => request.caller.toLog()),
    ).toMatchObject([
      { from: { name: 'exampleDialog/signal-left' } },
      { from: { name: 'exampleDialog/signal-requested' } },
    ]);
  });

  test('эхо: выход, вызванный самим ботом (его unban) — UC не вызван; тот же выход по действию администратора — вызван', async () => {
    const { dispatch, telegram, updates } = world();

    await telegram.receive(updates.left(GROUP1, MEMBER_A, BOT));
    expect(dispatch.requests).toEqual([]);

    await telegram.receive(updates.left(GROUP1, MEMBER_A, ADMIN));
    expect(dispatch.requests).toHaveLength(1);
  });
});

describe('сообщество на Telegram — реакции', () => {
  test('событие домена → query UC → exclude: в журнале порта ban на 300 с и unban', async () => {
    const { api, bus } = world();

    bus.publish(envelope(TaskEvents.assigned, 'e-1', TASK1));
    await bus.delivered();

    expect(api.journal).toEqual([
      {
        method: 'banChatMember',
        params: { chat_id: GROUP1, user_id: MEMBER_A, until_date: UNTIL },
      },
      {
        method: 'unbanChatMember',
        params: { chat_id: GROUP1, user_id: MEMBER_A, only_if_banned: true },
      },
    ]);
  });

  test('заявка (requested) → UC; затем событие домена → approve: approveChatJoinRequest с числами', async () => {
    const { api, bus, dispatch, telegram, updates } = world();

    await telegram.receive(updates.joinRequest(GROUP1, MEMBER_B));
    bus.publish(envelope(TaskEvents.completed, 'e-1', TASK2));
    await bus.delivered();

    expect(dispatch.requests[0]?.uc.name).toBe(RemoveUserUcDef.name);
    expect(api.journal).toEqual([
      {
        method: 'approveChatJoinRequest',
        params: { chat_id: GROUP1, user_id: MEMBER_B },
      },
    ]);
  });

  test('после отказа unban повтор того же события исполняет оба вызова заново (отсев — chat-ui; здесь — журнал порта)', async () => {
    const { api, bus } = world();
    api.failOn('unbanChatMember', { error_code: 400, description: 'x' });

    bus.publish(envelope(TaskEvents.assigned, 'e-1', TASK1));
    await bus.delivered();
    bus.publish(envelope(TaskEvents.assigned, 'e-1', TASK1));
    await bus.delivered();

    expect(calls(api)).toEqual([
      `banChatMember ${GROUP1} ${MEMBER_A}`,
      `unbanChatMember ${GROUP1} ${MEMBER_A}`,
      `banChatMember ${GROUP1} ${MEMBER_A}`,
      `unbanChatMember ${GROUP1} ${MEMBER_A}`,
    ]);
  });

  test('лог мира не содержит id групп, участников и апдейтов (ERR-07)', async () => {
    const { api, bus, logger, telegram, updates } = world();
    api.failOn('unbanChatMember', {
      error_code: 403,
      description: 'Forbidden',
    });

    await telegram.receive(updates.joined(GROUP1, MEMBER_A, ADMIN));
    await telegram.receive(updates.joined(-1004009999999, MEMBER_A, ADMIN));
    bus.publish(envelope(TaskEvents.assigned, 'e-1', TASK1));
    await bus.delivered();

    const json = JSON.stringify(logger.records);
    for (const secret of [GROUP1, GROUP2, MEMBER_A, MEMBER_B, ADMIN, BOT]) {
      expect(json).not.toContain(String(secret));
    }
  });
});

describe('сообщество на Telegram — очередь', () => {
  test('две реакции exclude одной группы идут по очереди без перемежения: ban A, unban A, ban B, unban B; реакция другой группы не ждёт', async () => {
    const { api, bus } = world();
    const release = api.holdOn('banChatMember');

    bus.publish(envelope(TaskEvents.assigned, 'e-1', TASK1));
    bus.publish(envelope(TaskEvents.assigned, 'e-2', TASK2));
    bus.publish(envelope(TaskEvents.assigned, 'e-3', TASK3));
    // Первый ban группы 1 придержан, группа 2 прошла целиком.
    await api.reached(() => calls(api, GROUP2).length === 2);

    release();
    await bus.delivered();

    expect(calls(api, GROUP1)).toEqual([
      `banChatMember ${GROUP1} ${MEMBER_A}`,
      `unbanChatMember ${GROUP1} ${MEMBER_A}`,
      `banChatMember ${GROUP1} ${MEMBER_B}`,
      `unbanChatMember ${GROUP1} ${MEMBER_B}`,
    ]);
    expect(calls(api, GROUP2)).toHaveLength(2);
  });
});
