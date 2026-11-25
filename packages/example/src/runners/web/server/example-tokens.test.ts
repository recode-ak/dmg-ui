import { describe, expect, test } from 'bun:test';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { useTempDir } from 'dmg-core/testing';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { ExampleTokens } from './example-tokens';

// Пропуск человека — 32 случайных байта в base64url (43 знака, не `uuid`),
// по одному на человека. Хранится в `tokens.json` каталога данных с правами
// 0600 и переживает перезапуск сервера: иначе вкладки после остановки и
// запуска получили бы отказ. Порча файла — выпуск заново.

const tmp = useTempDir('example-web-tokens-');
const SHAPE = /^[A-Za-z0-9_-]{43}$/;

const person = (key: string) => {
  const found = EXAMPLE_PEOPLE.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`нет человека ${key}`);
  return found;
};

const file = () => tmp().file('tokens.json');

/** Пропуск человека; нет — бросок теста. */
const tokenOf = (tokens: ExampleTokens, key: string): string => {
  const token = tokens.tokenOf(key);
  if (token === undefined) throw new Error(`нет пропуска ${key}`);
  return token;
};

describe('ExampleTokens.open — выпуск', () => {
  test('у каждого человека пропуск — 43 знака base64url', async () => {
    const tokens = await ExampleTokens.open(tmp().path);

    for (const { key } of EXAMPLE_PEOPLE) {
      expect(tokenOf(tokens, key)).toMatch(SHAPE);
    }
  });

  test('пропуска у людей разные и не похожи на uuid', async () => {
    const tokens = await ExampleTokens.open(tmp().path);

    const anna = tokenOf(tokens, 'anna');
    const boris = tokenOf(tokens, 'boris');
    expect(anna).not.toBe(boris);
    expect(anna).not.toBe(person('anna').uuid);
  });

  test('повторное открытие каталога — те же пропуска', async () => {
    const first = await ExampleTokens.open(tmp().path);
    const second = await ExampleTokens.open(tmp().path);

    for (const { key } of EXAMPLE_PEOPLE) {
      expect(tokenOf(second, key)).toBe(tokenOf(first, key));
    }
  });

  test('файл tokens.json — права 0600', async () => {
    await ExampleTokens.open(tmp().path);

    expect(statSync(file()).mode & 0o777).toBe(0o600);
  });
});

describe('ExampleTokens.open — порча файла: выпуск заново', () => {
  /** Пропуска после порчи файла `mutate`; старые — для сравнения. */
  const reopened = async (
    mutate: (text: string, anna: string, boris: string) => string,
  ) => {
    const old = await ExampleTokens.open(tmp().path);
    const anna = tokenOf(old, 'anna');
    const boris = tokenOf(old, 'boris');
    writeFileSync(file(), mutate(readFileSync(file(), 'utf8'), anna, boris));
    const fresh = await ExampleTokens.open(tmp().path);
    return { anna, boris, fresh };
  };

  const broken: [
    string,
    (text: string, anna: string, boris: string) => string,
  ][] = [
    ['не JSON', () => 'not json {'],
    ['пустой файл', () => ''],
    ['пустой объект', () => '{}'],
    ['массив', () => '[]'],
    ['null', () => 'null'],
    ['пропуск Анны короче', (text, anna) => text.replace(anna, 'short')],
    [
      'пропуск Анны с чужими знаками',
      (text, anna) => text.replace(anna, '+'.repeat(43)),
    ],
    [
      'чужой пропуск вместо пропуска человека',
      (text, anna, boris) => text.replace(anna, boris),
    ],
  ];

  for (const [name, mutate] of broken) {
    test(`${name}: у людей годные разные пропуска, порченое значение не принято`, async () => {
      const { anna, fresh } = await reopened(mutate);

      const newAnna = tokenOf(fresh, 'anna');
      const newBoris = tokenOf(fresh, 'boris');
      expect(newAnna).toMatch(SHAPE);
      expect(newBoris).toMatch(SHAPE);
      expect(newAnna).not.toBe(newBoris);
      expect(newAnna).not.toBe('short');
      expect(newAnna).not.toBe('+'.repeat(43));
      if (name === 'не JSON') expect(newAnna).not.toBe(anna);
    });
  }

  test('после выпуска заново файл снова с правами 0600 и открывается теми же пропусками', async () => {
    await reopened(() => 'not json {');

    expect(statSync(file()).mode & 0o777).toBe(0o600);
    const again = await ExampleTokens.open(tmp().path);
    const once = await ExampleTokens.open(tmp().path);
    expect(tokenOf(again, 'anna')).toBe(tokenOf(once, 'anna'));
  });
});

describe('ExampleTokens — личность по пропуску', () => {
  test('personOf: пропуск человека — его uuid', async () => {
    const tokens = await ExampleTokens.open(tmp().path);

    for (const { key, uuid } of EXAMPLE_PEOPLE) {
      expect(await tokens.personOf(tokenOf(tokens, key))).toBe(uuid);
    }
  });

  test('keyOf: пропуск человека — его ключ', async () => {
    const tokens = await ExampleTokens.open(tmp().path);

    expect(tokens.keyOf(tokenOf(tokens, 'anna'))).toBe('anna');
    expect(tokens.keyOf(tokenOf(tokens, 'boris'))).toBe('boris');
  });

  test('чужой, пустой и подправленный на один знак пропуск — undefined', async () => {
    const tokens = await ExampleTokens.open(tmp().path);
    const anna = tokenOf(tokens, 'anna');
    const tweaked = `${anna.slice(0, -1)}${anna.endsWith('A') ? 'B' : 'A'}`;

    for (const foreign of [
      '',
      'tA',
      'A'.repeat(43),
      person('anna').uuid,
      tweaked,
    ]) {
      expect(await tokens.personOf(foreign)).toBeUndefined();
      expect(tokens.keyOf(foreign)).toBeUndefined();
    }
  });

  test('tokenOf: неизвестный ключ — undefined', async () => {
    const tokens = await ExampleTokens.open(tmp().path);

    expect(tokens.tokenOf('nobody')).toBeUndefined();
  });
});
