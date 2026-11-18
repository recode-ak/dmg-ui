import { describe, expect, test } from 'bun:test';
import { CoreErrors, ErrorDef, err, ok } from 'dmg-core';
import { MemoryLogger } from 'dmg-core/testing';
import { PAGE_CHANNEL } from '../page-channel.const';
import type {
  NotificationMessage,
  ResultMessage,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import { MAX_SERVER_TEXT } from '../wire/page-wire.const';
import { PageOutbox } from './page-outbox';

// Отправка сообщений сервера одному соединению с пределом длины строки:
// предел меряется на той строке, что уходит в сокет. Длинный `result`
// заменяется отказом с тем же `id` (вызов не висит), длинное уведомление и
// прочее отбрасываются; `warn` — фиксированным текстом, раз на вид.

const GUARD = 'страж-данных-сообщения';

/** Уведомление, строка JSON которого ровно `length` символов. */
const notificationOf = (length: number): NotificationMessage => {
  const base: NotificationMessage = {
    kind: 'notification',
    notification: 'exampleUi/todo/taskAssigned',
    data: GUARD,
    links: [],
    eventId: 'e-1',
  };
  const pad = length - JSON.stringify(base).length;
  return { ...base, data: GUARD + 'x'.repeat(pad) };
};

/** Ответ на вызов `id`, строка JSON которого ровно `length` символов. */
const resultOf = (id: string, length: number): ResultMessage => {
  const base: ResultMessage = {
    kind: 'result',
    id,
    result: ok({ text: GUARD }),
  };
  const pad = length - JSON.stringify(base).length;
  return { ...base, result: ok({ text: GUARD + 'x'.repeat(pad) }) };
};

/** Отказ вызова `id` строкой — тот же, что у предела одновременных вызовов. */
const refusalOf = (id: string) =>
  JSON.stringify({
    kind: 'result',
    id,
    result: err(ErrorDef.serialize(CoreErrors.SERVER_INTERNAL.make())),
  });

const outbox = () => {
  const sent: string[] = [];
  const logger = new MemoryLogger();
  const box = new PageOutbox({
    send: (text) => {
      sent.push(text);
    },
    logger,
    source: PAGE_CHANNEL,
  });
  return { box, sent, logger };
};

const warns = (logger: MemoryLogger) =>
  logger.records.filter((r) => r.level === 'warn');

describe('PageOutbox.push', () => {
  test('короткое сообщение — строка JSON как есть, без warn', () => {
    const { box, sent, logger } = outbox();
    const message: ServerMsg = { kind: 'watch-refused', watch: 'w1' };

    box.push(message);

    expect(sent).toEqual([JSON.stringify(message)]);
    expect(logger.records).toEqual([]);
  });

  test('result длиннее предела — result с тем же id и SERVER_INTERNAL, один warn', () => {
    const { box, sent, logger } = outbox();

    box.push(resultOf('c1', MAX_SERVER_TEXT + 1));

    expect(sent).toEqual([refusalOf('c1')]);
    expect(warns(logger)).toMatchObject([{ source: PAGE_CHANNEL }]);
  });

  test('два длинных result — два отказа со своими id, warn один', () => {
    const { box, sent, logger } = outbox();

    box.push(resultOf('c1', MAX_SERVER_TEXT + 1));
    box.push(resultOf('c2', MAX_SERVER_TEXT + 10));

    expect(sent).toEqual([refusalOf('c1'), refusalOf('c2')]);
    expect(warns(logger)).toHaveLength(1);
  });

  test('notification длиннее предела — ничего не отправлено, warn', () => {
    const { box, sent, logger } = outbox();

    box.push(notificationOf(MAX_SERVER_TEXT + 1));

    expect(sent).toEqual([]);
    expect(warns(logger)).toHaveLength(1);
  });

  test('прочее длиннее предела (hello) — отброшено как дефект, warn', () => {
    const { box, sent, logger } = outbox();
    const locale = 'x'.repeat(MAX_SERVER_TEXT);

    box.push({
      kind: 'hello',
      context: { locale, timeZone: 'UTC', delegate: false, readOnly: false },
    });

    expect(sent).toEqual([]);
    expect(warns(logger)).toHaveLength(1);
  });

  test('длинные result и notification — по одному warn на вид', () => {
    const { box, logger } = outbox();

    box.push(resultOf('c1', MAX_SERVER_TEXT + 1));
    box.push(notificationOf(MAX_SERVER_TEXT + 1));
    box.push(resultOf('c2', MAX_SERVER_TEXT + 1));
    box.push(notificationOf(MAX_SERVER_TEXT + 1));

    const texts = warns(logger).map((r) => r.message);
    expect(texts).toHaveLength(2);
    expect(new Set(texts).size).toBe(2);
  });

  test('ровно на пределе — отправлено как есть', () => {
    const { box, sent, logger } = outbox();
    const result = resultOf('c1', MAX_SERVER_TEXT);
    const notification = notificationOf(MAX_SERVER_TEXT);

    box.push(result);
    box.push(notification);

    expect(sent).toEqual([
      JSON.stringify(result),
      JSON.stringify(notification),
    ]);
    expect(sent.map((text) => text.length)).toEqual([
      MAX_SERVER_TEXT,
      MAX_SERVER_TEXT,
    ]);
    expect(logger.records).toEqual([]);
  });

  test('в warn нет данных сообщения', () => {
    const { box, logger } = outbox();

    box.push(resultOf('c1', MAX_SERVER_TEXT + 1));
    box.push(notificationOf(MAX_SERVER_TEXT + 1));

    expect(warns(logger)).toHaveLength(2);
    expect(JSON.stringify(logger.records)).not.toContain(GUARD);
  });
});
