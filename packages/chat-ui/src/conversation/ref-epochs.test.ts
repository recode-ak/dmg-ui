import { describe, expect, test } from 'bun:test';
import { RefEpochs } from './ref-epochs';
import { RefTable } from './ref-table';

// Эпоха ссылок по умолчанию: 5 случайных знаков [a-z0-9], годных для
// таблицы ссылок.

describe('RefEpochs', () => {
  test('эпоха — 5 знаков [a-z0-9], таблица ссылок её принимает', () => {
    for (let i = 0; i < 100; i += 1) {
      const epoch = RefEpochs.random();

      expect(epoch).toMatch(/^[a-z0-9]{5}$/);
      expect(
        new RefTable(epoch).add({
          kind: 'skip',
          draft: 1,
          field: 'a',
          label: 'b',
        }),
      ).toBe(`${epoch}1`);
    }
  });

  test('эпохи случайны: из 100 почти все разные', () => {
    const epochs = new Set(Array.from({ length: 100 }, RefEpochs.random));

    expect(epochs.size).toBeGreaterThan(95);
  });
});

describe('RefTable — эпоха', () => {
  test.each(['', 'abcd', 'abcdef', 'ABCDE', 'ab-de'])(
    'эпоха не из 5 знаков [a-z0-9] — бросок при сборке: %p',
    (epoch) => {
      expect(() => new RefTable(epoch)).toThrow();
    },
  );
});
