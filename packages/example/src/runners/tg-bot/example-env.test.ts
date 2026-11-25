import { describe, expect, test } from 'bun:test';
import { ExampleEnv } from './example-env';

// Окружение примера: только разбор переданных переменных, `process` не читается.
// Отказ — `Err` с именем переменной и текстом; значения переменных (токен, id
// людей) в тексте не повторяются.

const TOKEN = ['tok', 'secret', '99'].join('-');

const vars = (extra: Record<string, string | undefined> = {}) => ({
  EXAMPLE_TG_TOKEN: TOKEN,
  EXAMPLE_TG_USERS: '111',
  ...extra,
});

const refusal = (input: Record<string, string | undefined>) => {
  const res = ExampleEnv.read(input);
  if (res.ok) throw new Error('ожидался отказ');
  return res.error;
};

const accepted = (input: Record<string, string | undefined>) => {
  const res = ExampleEnv.read(input);
  if (!res.ok) throw new Error(`ожидался успех: ${res.error.text}`);
  return res.value;
};

describe('ExampleEnv.read — токен', () => {
  test('нет EXAMPLE_TG_TOKEN — отказ с именем переменной, без значений', () => {
    const error = refusal({ EXAMPLE_TG_USERS: '424242' });
    expect(error.variable).toBe('EXAMPLE_TG_TOKEN');
    expect(error.text).toContain('EXAMPLE_TG_TOKEN');
    expect(error.text).not.toContain('424242');
  });

  test('пустой токен — отказ', () => {
    expect(refusal(vars({ EXAMPLE_TG_TOKEN: '' })).variable).toBe(
      'EXAMPLE_TG_TOKEN',
    );
  });

  test('токен попадает в значение', () => {
    expect(accepted(vars()).token).toBe(TOKEN);
  });
});

describe('ExampleEnv.read — EXAMPLE_TG_USERS', () => {
  test('один id — принят', () => {
    expect(accepted(vars({ EXAMPLE_TG_USERS: '111' })).users).toEqual([111]);
  });

  test('два id — первый A, второй B (порядок сохранён)', () => {
    expect(accepted(vars({ EXAMPLE_TG_USERS: '222,111' })).users).toEqual([
      222, 111,
    ]);
  });

  const bad: Array<[string, string | undefined]> = [
    ['не задана', undefined],
    ['пустая строка (ноль id)', ''],
    ['три id', '1,2,3'],
    ['повтор', '5,5'],
    ['нецелое', '1.5'],
    ['не число', 'abc'],
    ['отрицательное', '-5'],
    ['не безопасное целое', '9007199254740993'],
  ];
  for (const [name, value] of bad) {
    test(`${name} — отказ`, () => {
      const error = refusal(vars({ EXAMPLE_TG_USERS: value }));
      expect(error.variable).toBe('EXAMPLE_TG_USERS');
      expect(error.text).toContain('EXAMPLE_TG_USERS');
    });
  }

  test('значение переменной в тексте отказа не повторяется', () => {
    const error = refusal(vars({ EXAMPLE_TG_USERS: '1.5,777' }));
    expect(error.text).not.toContain('777');
    expect(error.text).not.toContain('1.5');
  });
});

describe('ExampleEnv.read — остальные переменные', () => {
  test('EXAMPLE_TG_LOG по умолчанию info', () => {
    expect(accepted(vars()).logLevel).toBe('info');
  });

  test('EXAMPLE_TG_LOG=debug принят', () => {
    expect(accepted(vars({ EXAMPLE_TG_LOG: 'debug' })).logLevel).toBe('debug');
  });

  test('неизвестный уровень — отказ без значения в тексте', () => {
    const error = refusal(vars({ EXAMPLE_TG_LOG: 'verbose' }));
    expect(error.variable).toBe('EXAMPLE_TG_LOG');
    expect(error.text).not.toContain('verbose');
  });

  test('EXAMPLE_TG_TRACE и EXAMPLE_TG_DATA необязательны', () => {
    const value = accepted(vars());
    expect(value.tracePath).toBeUndefined();
    expect(value.dataDir).toBeUndefined();
  });

  test('EXAMPLE_TG_TRACE и EXAMPLE_TG_DATA передаются как есть', () => {
    const value = accepted(
      vars({ EXAMPLE_TG_TRACE: '/t/trace.jsonl', EXAMPLE_TG_DATA: '/t/data' }),
    );
    expect(value.tracePath).toBe('/t/trace.jsonl');
    expect(value.dataDir).toBe('/t/data');
  });
});

describe('ExampleEnv.read — отказ не раскрывает токен', () => {
  test('токен верный, ошибка в EXAMPLE_TG_USERS — в тексте отказа токена нет', () => {
    const error = refusal(vars({ EXAMPLE_TG_USERS: 'abc' }));
    expect(error.text).not.toContain(TOKEN);
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });

  test('токен верный, ошибка в EXAMPLE_TG_LOG — токена в отказе нет', () => {
    const error = refusal(vars({ EXAMPLE_TG_LOG: 'loud' }));
    expect(JSON.stringify(error)).not.toContain(TOKEN);
  });
});
