import { describe, expect, test } from 'bun:test';
import { err, ok } from 'dmg-core';
import { MemoryLogger } from 'dmg-core/testing';
import { MemoryBotApi } from '../../testing';
import { TelegramMessenger } from '../messenger/telegram-messenger';

// Операции группы Telegram — порт сообщества мессенджера на
// подставном порту Bot API. `exclude` = `banChatMember` на минуту
// (`until_date` — страховка от вечного бана) и `unbanChatMember` с
// `only_if_banned`; `approve` = `approveChatJoinRequest`; `invite` не
// объявлена — отказ без вызова. Handle группы — отрицательное каноническое
// целое, участник — положительное, иначе отказ без вызова API. Недоставка —
// значение, не бросок (ERR-01); лог без id группы и участника (ERR-07).
// Часы — `now` мессенджера (мс): тест без таймеров (TST-04).

const GROUP = '-1004001234567';
const MEMBER = '7350001234';
const NOW = 1_700_000_000_000;
const UNTIL = 1_700_000_060;
const MIGRATED_TO = -1009990001111;

/** Мессенджер с часами теста на подставном порту. */
const setup = () => {
  const api = new MemoryBotApi();
  const logger = new MemoryLogger();
  const messenger = new TelegramMessenger({ api, logger, now: () => NOW });
  return { api, logger, community: messenger.community, messenger };
};

const methods = (api: MemoryBotApi) => api.journal.map((call) => call.method);

const warns = (logger: MemoryLogger) =>
  logger.records.filter((record) => record.level === 'warn');

const errors = (logger: MemoryLogger) =>
  logger.records.filter((record) => record.level === 'error');

/** Ни одна запись лога не содержит значения. */
const lacks = (logger: MemoryLogger, values: readonly string[]) => {
  const json = JSON.stringify(logger.records);
  for (const value of values) expect(json).not.toContain(value);
};

const BAN = { chat_id: Number(GROUP), user_id: Number(MEMBER) };

describe('TelegramCommunity — exclude', () => {
  test('ban на минуту от часов теста, затем unban только если забанен; итог ok, записей лога нет', async () => {
    const { api, logger, community } = setup();

    expect(await community.exclude(GROUP, MEMBER)).toEqual(ok());

    expect(api.journal).toEqual([
      {
        method: 'banChatMember',
        params: { ...BAN, until_date: UNTIL },
      },
      {
        method: 'unbanChatMember',
        params: { ...BAN, only_if_banned: true },
      },
    ]);
    expect(logger.records).toEqual([]);
  });

  test('chat_id и user_id — числа, а не строки: строку Bot API понял бы как имя канала', async () => {
    const { api, community } = setup();

    await community.exclude(GROUP, MEMBER);

    for (const call of api.journal) {
      expect(typeof (call.params as { chat_id: unknown }).chat_id).toBe(
        'number',
      );
      expect(typeof (call.params as { user_id: unknown }).user_id).toBe(
        'number',
      );
    }
  });

  test('без заданных часов until_date — текущее время плюс минута', async () => {
    const api = new MemoryBotApi();
    const community = new TelegramMessenger({
      api,
      logger: new MemoryLogger(),
    }).community;
    const before = Math.floor(Date.now() / 1000);

    await community.exclude(GROUP, MEMBER);

    const after = Math.floor(Date.now() / 1000);
    const ban = api.journal[0];
    if (ban?.method !== 'banChatMember') throw new Error('нужен ban');
    expect(ban.params.until_date).toBeGreaterThanOrEqual(before + 60);
    expect(ban.params.until_date).toBeLessThanOrEqual(after + 60);
  });

  test.each([
    [400, 'rejected'],
    [403, 'blocked'],
    [429, 'unavailable'],
    [502, 'unavailable'],
  ] as const)(
    'ban отказал (%i) — %s: unban не вызван, warn с методом и кодом',
    async (code, reason) => {
      const { api, logger, community } = setup();
      api.failOn('banChatMember', {
        error_code: code,
        description: 'Bad Request: x',
      });

      expect(await community.exclude(GROUP, MEMBER)).toEqual(err({ reason }));

      expect(methods(api)).toEqual(['banChatMember']);
      expect(warns(logger)).toHaveLength(1);
      expect(warns(logger)[0]).toMatchObject({
        source: 'tg-bot',
        meta: {
          operation: 'exclude',
          method: 'banChatMember',
          error_code: code,
        },
      });
      lacks(logger, [GROUP, MEMBER]);
    },
  );

  test.each([
    [400, 'rejected'],
    [403, 'blocked'],
    [429, 'unavailable'],
  ] as const)(
    'ban прошёл, unban отказал (%i) — недоставка %s и warn с методом unbanChatMember',
    async (code, reason) => {
      const { api, logger, community } = setup();
      api.failOn('unbanChatMember', {
        error_code: code,
        description: 'Bad Request: x',
      });

      expect(await community.exclude(GROUP, MEMBER)).toEqual(err({ reason }));

      expect(methods(api)).toEqual(['banChatMember', 'unbanChatMember']);
      expect(warns(logger)).toHaveLength(1);
      expect(warns(logger)[0]?.meta).toMatchObject({
        operation: 'exclude',
        method: 'unbanChatMember',
        error_code: code,
      });
      lacks(logger, [GROUP, MEMBER]);
    },
  );

  test('повторный вызов после отказа unban шлёт оба метода заново: ban повторно безвреден', async () => {
    const { api, community } = setup();
    api.failOn('unbanChatMember', { error_code: 400, description: 'x' });

    expect(await community.exclude(GROUP, MEMBER)).toEqual(
      err({ reason: 'rejected' }),
    );
    expect(await community.exclude(GROUP, MEMBER)).toEqual(ok());

    expect(methods(api)).toEqual([
      'banChatMember',
      'unbanChatMember',
      'banChatMember',
      'unbanChatMember',
    ]);
  });

  test('ban бросил — unavailable, unban не вызван, error с операцией, методом и именем ошибки без текста', async () => {
    const { api, logger, community } = setup();
    api.throwNext(new TypeError(`сеть ${MEMBER}`));

    expect(await community.exclude(GROUP, MEMBER)).toEqual(
      err({ reason: 'unavailable' }),
    );

    expect(methods(api)).toEqual(['banChatMember']);
    expect(errors(logger)).toHaveLength(1);
    expect(errors(logger)[0]?.meta).toMatchObject({
      operation: 'exclude',
      method: 'banChatMember',
      name: 'TypeError',
    });
    lacks(logger, [GROUP, MEMBER]);
  });

  test('unban бросил — unavailable, error с методом unbanChatMember', async () => {
    class UnbanBreaks extends MemoryBotApi {
      override async unbanChatMember(): Promise<never> {
        throw new RangeError(`сеть ${MEMBER}`);
      }
    }
    const logger = new MemoryLogger();
    const api = new UnbanBreaks();
    const { community } = new TelegramMessenger({
      api,
      logger,
      now: () => NOW,
    });

    expect(await community.exclude(GROUP, MEMBER)).toEqual(
      err({ reason: 'unavailable' }),
    );

    expect(methods(api)).toEqual(['banChatMember']);
    expect(errors(logger)[0]?.meta).toMatchObject({
      operation: 'exclude',
      method: 'unbanChatMember',
      name: 'RangeError',
    });
    lacks(logger, [GROUP, MEMBER]);
  });

  test('метод не бросает при любом сбое порта', async () => {
    const { api, community } = setup();
    api.throwNext(new Error('x'));

    await expect(community.exclude(GROUP, MEMBER)).resolves.toBeDefined();
  });
});

describe('TelegramCommunity — approve', () => {
  test('approveChatJoinRequest с chat_id и user_id числами; итог ok, записей нет', async () => {
    const { api, logger, community } = setup();

    expect(await community.approve(GROUP, MEMBER)).toEqual(ok());

    expect(api.journal).toEqual([
      { method: 'approveChatJoinRequest', params: BAN },
    ]);
    expect(logger.records).toEqual([]);
  });

  test.each([
    [400, 'rejected'],
    [403, 'blocked'],
    [429, 'unavailable'],
  ] as const)(
    'отказ %i — %s, warn с операцией approve и методом',
    async (code, reason) => {
      const { api, logger, community } = setup();
      api.failOn('approveChatJoinRequest', {
        error_code: code,
        description: 'Bad Request: x',
      });

      expect(await community.approve(GROUP, MEMBER)).toEqual(err({ reason }));

      expect(warns(logger)[0]?.meta).toMatchObject({
        operation: 'approve',
        method: 'approveChatJoinRequest',
        error_code: code,
      });
      lacks(logger, [GROUP, MEMBER]);
    },
  );

  test('бросок порта — unavailable, error с именем ошибки', async () => {
    const { api, logger, community } = setup();
    api.throwNext(new TypeError('сеть'));

    expect(await community.approve(GROUP, MEMBER)).toEqual(
      err({ reason: 'unavailable' }),
    );
    expect(errors(logger)[0]?.meta).toMatchObject({
      operation: 'approve',
      name: 'TypeError',
    });
  });
});

describe('TelegramCommunity — invite', () => {
  test('invite не объявлена: rejected, порт не вызван, error без данных', async () => {
    const { api, logger, community } = setup();

    expect(await community.invite(GROUP, MEMBER)).toEqual(
      err({ reason: 'rejected' }),
    );

    expect(api.journal).toEqual([]);
    expect(errors(logger)).toHaveLength(1);
    expect(errors(logger)[0]).toMatchObject({
      source: 'tg-bot',
      meta: { operation: 'invite' },
    });
    lacks(logger, [GROUP, MEMBER]);
  });
});

describe('TelegramCommunity — handle группы и участника', () => {
  const BAD_GROUPS = [
    ['положительный (личный чат)', '42'],
    ['личный peer участника', MEMBER],
    ['@name', '@school_group'],
    ['«-0»', '-0'],
    ['«-1.5»', '-1.5'],
    ['пустой', ''],
    ['только минус', '-'],
    ['ноль', '0'],
    ['ведущий ноль', '-01004001234567'],
    ['экспонента', '-1e12'],
    ['с пробелом', ' -1004001234567'],
    ['небезопасное целое', '-9007199254740993'],
  ] as const;
  const BAD_MEMBERS = [
    ['ноль', '0'],
    ['отрицательный', '-5'],
    ['идентификатор группы', GROUP],
    ['ведущий ноль', '07350001234'],
    ['дробный', '1.5'],
    ['пустой', ''],
    ['@name', '@human'],
    ['экспонента', '1e3'],
    ['небезопасное целое', '9007199254740993'],
    ['с пробелом', '7350001234 '],
  ] as const;

  for (const operation of ['exclude', 'approve'] as const) {
    for (const [name, group] of BAD_GROUPS) {
      test(`${operation}: группа — ${name} — rejected, порт не вызван, error без значения`, async () => {
        const { api, logger, community } = setup();

        expect(await community[operation](group, MEMBER)).toEqual(
          err({ reason: 'rejected' }),
        );

        expect(api.journal).toEqual([]);
        expect(errors(logger)).toHaveLength(1);
        expect(errors(logger)[0]?.meta).toMatchObject({ operation });
        lacks(logger, [MEMBER, ...(group.length > 3 ? [group] : [])]);
      });
    }

    for (const [name, member] of BAD_MEMBERS) {
      test(`${operation}: участник — ${name} — rejected, порт не вызван, error без значения`, async () => {
        const { api, logger, community } = setup();

        expect(await community[operation](GROUP, member)).toEqual(
          err({ reason: 'rejected' }),
        );

        expect(api.journal).toEqual([]);
        expect(errors(logger)).toHaveLength(1);
        expect(errors(logger)[0]?.meta).toMatchObject({ operation });
        lacks(logger, [GROUP, ...(member.length > 3 ? [member] : [])]);
      });
    }

    test(`${operation}: граничные допустимые — группа «-1», участник «1» и крупные безопасные целые — уходят в порт`, async () => {
      const { api, community } = setup();

      expect(await community[operation]('-1', '1')).toEqual(ok());
      expect(
        await community[operation]('-9007199254740991', '9007199254740991'),
      ).toEqual(ok());

      expect(api.journal).toHaveLength(operation === 'exclude' ? 4 : 2);
    });
  }

  test('ban не вызван ни при плохой группе, ни при плохом участнике: вечный бан по неверному адресу невозможен', async () => {
    const { api, community } = setup();

    await community.exclude('42', MEMBER);
    await community.exclude(GROUP, '-7');

    expect(api.journal).toEqual([]);
  });
});

describe('TelegramCommunity — группа стала супергруппой (С2-A)', () => {
  const MIGRATED = {
    error_code: 400,
    description: 'Bad Request: group chat was upgraded to a supergroup chat',
    parameters: { migrate_to_chat_id: MIGRATED_TO },
  };

  test('exclude: отказ с migrate_to_chat_id — rejected, unban не вызван, warn «перенесена» без id', async () => {
    const { api, logger, community } = setup();
    api.failOn('banChatMember', MIGRATED);

    expect(await community.exclude(GROUP, MEMBER)).toEqual(
      err({ reason: 'rejected' }),
    );

    expect(methods(api)).toEqual(['banChatMember']);
    expect(
      warns(logger).some((record) => record.message.includes('перенесена')),
    ).toBe(true);
    lacks(logger, [GROUP, MEMBER, String(MIGRATED_TO), '1009990001111']);
  });

  test('approve: отказ с migrate_to_chat_id — rejected и тот же warn', async () => {
    const { api, logger, community } = setup();
    api.failOn('approveChatJoinRequest', MIGRATED);

    expect(await community.approve(GROUP, MEMBER)).toEqual(
      err({ reason: 'rejected' }),
    );

    expect(
      warns(logger).some((record) => record.message.includes('перенесена')),
    ).toBe(true);
    lacks(logger, [GROUP, MEMBER, '1009990001111']);
  });

  test('description в логе — не длиннее 200 знаков', async () => {
    const { api, logger, community } = setup();
    api.failOn('banChatMember', {
      ...MIGRATED,
      description: 'x'.repeat(300),
    });

    await community.exclude(GROUP, MEMBER);

    for (const record of warns(logger)) {
      const description = record.meta?.description;
      if (typeof description === 'string') {
        expect(description.length).toBeLessThanOrEqual(200);
      }
    }
  });

  test('отказ 400 без migrate_to_chat_id — обычный отказ: «перенесена» не пишется', async () => {
    const { api, logger, community } = setup();
    api.failOn('banChatMember', {
      error_code: 400,
      description: 'Bad Request',
    });

    await community.exclude(GROUP, MEMBER);

    expect(
      warns(logger).some((record) => record.message.includes('перенесена')),
    ).toBe(false);
  });
});

describe('TelegramCommunity — лог без данных', () => {
  test('по всем путям: ни id группы, ни id участника, ни id апдейта, ни текста броска (ERR-07)', async () => {
    const { api, logger, community } = setup();

    await community.exclude(GROUP, MEMBER);
    api.failOn('banChatMember', { error_code: 403, description: 'Forbidden' });
    await community.exclude(GROUP, MEMBER);
    api.failOn('unbanChatMember', { error_code: 400, description: 'Bad' });
    await community.exclude(GROUP, MEMBER);
    api.throwNext(new TypeError(`секрет ${MEMBER} ${GROUP}`));
    await community.exclude(GROUP, MEMBER);
    api.failOn('approveChatJoinRequest', {
      error_code: 429,
      description: 'Too Many Requests',
    });
    await community.approve(GROUP, MEMBER);
    api.throwNext(new TypeError(`секрет ${MEMBER}`));
    await community.approve(GROUP, MEMBER);
    await community.invite(GROUP, MEMBER);
    await community.exclude('42', MEMBER);
    await community.approve(GROUP, '-5');

    expect(logger.records.length).toBeGreaterThanOrEqual(8);
    expect(logger.records.every((record) => record.source === 'tg-bot')).toBe(
      true,
    );
    lacks(logger, [GROUP, MEMBER, 'секрет', '1004001234567']);
  });
});
