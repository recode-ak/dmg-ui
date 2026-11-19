import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { ServerMessage } from './page-messages';

// Схема `hello`: контекст рендера соединения; субъект — необязательный JSON,
// форму которого знает проект, а не канал.

const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};

const parse = (context: unknown) =>
  v.safeParse(ServerMessage, { kind: 'hello', context });

describe('ServerMessage — hello', () => {
  test('без subject — проходит схему, ключа subject в результате нет', () => {
    const parsed = parse(CONTEXT);

    expect(parsed.success).toBe(true);
    expect(parsed.success && 'subject' in (parsed.output as any).context).toBe(
      false,
    );
  });

  test.each([
    ['объект', { uuid: 'u-1', roles: ['admin'] }],
    ['строка', 'u-1'],
    ['число', 7],
    ['список', ['u-1']],
    ['null', null],
  ])(
    'с subject — %s: проходит схему, значение сохранено как есть',
    (_name, subject) => {
      const parsed = parse({ ...CONTEXT, subject });

      expect(parsed.success).toBe(true);
      expect(parsed.success && (parsed.output as any).context.subject).toEqual(
        subject,
      );
    },
  );

  test('прочие поля контекста по-прежнему обязательны: без delegate — отказ', () => {
    const { delegate: _delegate, ...rest } = CONTEXT;

    expect(parse({ ...rest, subject: { uuid: 'u-1' } }).success).toBe(false);
  });
});
