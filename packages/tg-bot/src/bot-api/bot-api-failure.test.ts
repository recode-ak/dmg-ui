import { describe, expect, test } from 'bun:test';
import { BotApiFailure } from './bot-api-failure';

// Разбор отказа Bot API в причину недоставки: 403 — собеседник запретил,
// 429 и 5xx — временно (повтора по `retry_after` нет), прочий 400 — дефект
// показа. «message is not modified» — отдельный признак: у правок это
// «то же», а не отказ; распознаётся подстрокой без учёта регистра и только
// у 400.

const failure = (error_code: number, description: string) =>
  new BotApiFailure({ ok: false, error_code, description });

describe('BotApiFailure — причина недоставки', () => {
  test('403 — blocked', () => {
    expect(
      failure(403, 'Forbidden: bot was blocked by the user').reason(),
    ).toBe('blocked');
  });

  test('429 — unavailable', () => {
    const limited = new BotApiFailure({
      ok: false,
      error_code: 429,
      description: 'Too Many Requests: retry after 5',
      parameters: { retry_after: 5 },
    });

    expect(limited.reason()).toBe('unavailable');
  });

  test.each([500, 502, 504])('%d — unavailable', (code) => {
    expect(failure(code, 'Internal Server Error').reason()).toBe('unavailable');
  });

  test('прочий 400 — rejected', () => {
    expect(failure(400, 'Bad Request: chat not found').reason()).toBe(
      'rejected',
    );
  });
});

describe('BotApiFailure — «message is not modified»', () => {
  test('400 с подстрокой — признак есть', () => {
    expect(
      failure(
        400,
        'Bad Request: message is not modified: specified new message content and reply markup are exactly the same',
      ).notModified(),
    ).toBe(true);
  });

  test('регистр не важен', () => {
    expect(
      failure(400, 'BAD REQUEST: MESSAGE IS NOT MODIFIED').notModified(),
    ).toBe(true);
  });

  test('прочий 400 — признака нет', () => {
    expect(
      failure(400, 'Bad Request: message to edit not found').notModified(),
    ).toBe(false);
  });

  test('та же подстрока не у 400 — признака нет', () => {
    expect(failure(403, 'message is not modified').notModified()).toBe(false);
  });
});
