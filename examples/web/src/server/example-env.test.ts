import { describe, expect, test } from 'bun:test';
import { ExampleEnv } from './example-env';

// Окружение примера: только разбор переданных переменных, `process` не читается.
// Отказ — `Err` с именем переменной и текстом; значения переменных в тексте
// не повторяются. Пустая строка — как не заданная.

type Input = Record<string, string | undefined>;

const refusal = (input: Input) => {
  const res = ExampleEnv.read(input);
  if (res.ok) throw new Error('ожидался отказ');
  return res.error;
};

const accepted = (input: Input) => {
  const res = ExampleEnv.read(input);
  if (!res.ok) throw new Error(`ожидался успех: ${res.error.text}`);
  return res.value;
};

describe('ExampleEnv.read — по умолчанию', () => {
  test('пустое окружение: порт 4310, задержки нет, журнал info, каталог не задан', () => {
    const value = accepted({});

    expect(value.port).toBe(4310);
    expect(value.delayMs).toBe(0);
    expect(value.logLevel).toBe('info');
    expect(value.dataDir).toBeUndefined();
  });

  test('пустые строки — как не заданные', () => {
    const value = accepted({
      EXAMPLE_WEB_PORT: '',
      EXAMPLE_WEB_DELAY_MS: '',
      EXAMPLE_WEB_DATA: '',
      EXAMPLE_WEB_LOG: '',
    });

    expect(value).toMatchObject({ port: 4310, delayMs: 0, logLevel: 'info' });
    expect(value.dataDir).toBeUndefined();
  });
});

describe('ExampleEnv.read — EXAMPLE_WEB_PORT', () => {
  for (const [text, port] of [
    ['4311', 4311],
    ['1', 1],
    ['65535', 65535],
  ] as const) {
    test(`«${text}» — принят`, () => {
      expect(accepted({ EXAMPLE_WEB_PORT: text }).port).toBe(port);
    });
  }

  for (const bad of ['0', '65536', 'abc', '-1', '1.5', '80a', ' ']) {
    test(`«${bad}» — отказ с именем переменной`, () => {
      const error = refusal({ EXAMPLE_WEB_PORT: bad });

      expect(error.variable).toBe('EXAMPLE_WEB_PORT');
      expect(error.text).toContain('EXAMPLE_WEB_PORT');
    });
  }

  test('значение в тексте отказа не повторяется', () => {
    expect(refusal({ EXAMPLE_WEB_PORT: 'abc-секрет' }).text).not.toContain(
      'abc-секрет',
    );
    expect(refusal({ EXAMPLE_WEB_PORT: '70000' }).text).not.toContain('70000');
  });
});

describe('ExampleEnv.read — EXAMPLE_WEB_DELAY_MS', () => {
  for (const [text, delayMs] of [
    ['0', 0],
    ['6000', 6000],
    ['60000', 60000],
  ] as const) {
    test(`«${text}» — принят`, () => {
      expect(accepted({ EXAMPLE_WEB_DELAY_MS: text }).delayMs).toBe(delayMs);
    });
  }

  for (const bad of ['-1', '60001', 'abc', '1.5']) {
    test(`«${bad}» — отказ с именем переменной`, () => {
      const error = refusal({ EXAMPLE_WEB_DELAY_MS: bad });

      expect(error.variable).toBe('EXAMPLE_WEB_DELAY_MS');
      expect(error.text).toContain('EXAMPLE_WEB_DELAY_MS');
    });
  }

  test('значение в тексте отказа не повторяется', () => {
    expect(refusal({ EXAMPLE_WEB_DELAY_MS: '99999' }).text).not.toContain(
      '99999',
    );
  });
});

describe('ExampleEnv.read — EXAMPLE_WEB_LOG и EXAMPLE_WEB_DATA', () => {
  for (const level of ['debug', 'info', 'warn', 'error'] as const) {
    test(`уровень «${level}» принят`, () => {
      expect(accepted({ EXAMPLE_WEB_LOG: level }).logLevel).toBe(level);
    });
  }

  test('уровень вне списка — отказ без значения в тексте', () => {
    const error = refusal({ EXAMPLE_WEB_LOG: 'verbose' });

    expect(error.variable).toBe('EXAMPLE_WEB_LOG');
    expect(error.text).toContain('EXAMPLE_WEB_LOG');
    expect(error.text).not.toContain('verbose');
  });

  test('каталог данных передаётся как есть', () => {
    expect(accepted({ EXAMPLE_WEB_DATA: '/t/data' }).dataDir).toBe('/t/data');
  });

  test('отказ не раскрывает каталог данных', () => {
    const error = refusal({
      EXAMPLE_WEB_PORT: 'abc',
      EXAMPLE_WEB_DATA: '/home/секретный-каталог',
    });

    expect(JSON.stringify(error)).not.toContain('секретный-каталог');
  });
});
