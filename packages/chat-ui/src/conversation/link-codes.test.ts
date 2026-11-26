import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import type { AddressJson } from 'dmg-ui';
import { LINK_CODE } from './conversation.const';
import { LinkCodes } from './link-codes';

// Код ссылки на экран беседы (D-UI-127): SHA-256 канонического
// JSON адреса (ключи по порядку) → base64url → первые 22 знака. Один адрес —
// один код; без соли и срока; порядок ключей на код не влияет. Класс чистый:
// хранилища не знает, формат — `LINK_CODE`.

const LIST: AddressJson = {
  screen: 'exampleUi/todo/taskList',
  params: { page: 0 },
};

/** Эталон алгоритма, написанный независимо от класса: ключи по порядку на каждом уровне. */
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const body = Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`,
      );
    return `{${body.join(',')}}`;
  }
  return JSON.stringify(value);
};

const oracle = (json: unknown): string =>
  createHash('sha256').update(canonical(json)).digest('base64url').slice(0, 22);

describe('LinkCodes.of — код адреса', () => {
  test('формат: 22 знака [A-Za-z0-9_-], LINK_CODE и fits узнают его', async () => {
    const code = await LinkCodes.of(LIST);

    expect(code).toHaveLength(22);
    expect(code).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(LINK_CODE.test(code)).toBe(true);
    expect(LinkCodes.fits(code)).toBe(true);
  });

  test('эталонные значения: SHA-256 канонического JSON, base64url, первые 22 знака', async () => {
    expect(await LinkCodes.of(LIST)).toBe('Su8M0DgYIazvS95XXO5VAG');
    expect(await LinkCodes.of({ screen: 'a', params: {} })).toBe(
      'k8i_ldZjZVMwVzBZ71JBYu',
    );
  });

  test('совпадает с независимым эталоном на разных адресах', async () => {
    const addresses: AddressJson[] = [
      LIST,
      { screen: 'exampleUi/todo/mainMenu', params: {} },
      {
        screen: 'exampleUi/todo/taskCard',
        params: { taskId: '00000000-0000-4000-8000-0000000000aa' },
      },
      { screen: 'x/y/z', params: { тег: 'хлеб', n: [1, { b: 2, a: 1 }] } },
    ];

    for (const address of addresses) {
      expect(await LinkCodes.of(address)).toBe(oracle(address));
    }
  });

  test('детерминизм: один адрес — один код, сколько ни вызывай', async () => {
    expect(await LinkCodes.of(LIST)).toBe(await LinkCodes.of({ ...LIST }));
    expect(await LinkCodes.of(LIST)).toBe(
      await LinkCodes.of(structuredClone(LIST)),
    );
  });

  test('канонический JSON: порядок ключей не влияет — ни у адреса, ни у параметров', async () => {
    const first = {
      screen: 'm/n/s',
      params: { alpha: 1, beta: { x: 1, y: 2 }, gamma: 'в' },
    };
    const second = {
      params: { gamma: 'в', beta: { y: 2, x: 1 }, alpha: 1 },
      screen: 'm/n/s',
    };

    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second));
    expect(await LinkCodes.of(first)).toBe(await LinkCodes.of(second));
  });

  test('ключи объектов внутри массива тоже по порядку, порядок элементов массива — значим', async () => {
    const one = { screen: 's', params: { list: [{ a: 1, b: 2 }, 3] } };
    const same = { screen: 's', params: { list: [{ b: 2, a: 1 }, 3] } };
    const swapped = { screen: 's', params: { list: [3, { a: 1, b: 2 }] } };

    expect(await LinkCodes.of(one)).toBe(await LinkCodes.of(same));
    expect(await LinkCodes.of(one)).not.toBe(await LinkCodes.of(swapped));
  });

  test('адрес нормализуется кругом через JSON: ключ с undefined — тот же код, что без него и после круга', async () => {
    const loose = {
      screen: 'a/b/c',
      params: { page: 0, filter: undefined },
    } as AddressJson;
    const plain = JSON.parse(JSON.stringify(loose)) as AddressJson;

    expect(await LinkCodes.of(loose)).toBe(await LinkCodes.of(plain));
    expect(LinkCodes.canonical(loose)).toBe(LinkCodes.canonical(plain));
  });

  test('не JSON-представимый адрес — бросок', async () => {
    const bad = {
      screen: 'a/b/c',
      params: { n: 1n },
    } as unknown as AddressJson;

    await expect(LinkCodes.of(bad)).rejects.toThrow();
  });

  test('другой экран, другие параметры или другое значение — другой код', async () => {
    const codes = new Set([
      await LinkCodes.of(LIST),
      await LinkCodes.of({ ...LIST, screen: 'exampleUi/todo/taskCard' }),
      await LinkCodes.of({ ...LIST, params: { page: 1 } }),
      await LinkCodes.of({ ...LIST, params: { page: '0' } }),
      await LinkCodes.of({ ...LIST, params: {} }),
    ]);

    expect(codes.size).toBe(5);
  });
});

describe('LinkCodes.fits — формат кода', () => {
  test.each([
    ['A'.repeat(22)],
    ['a1_-B2_-c3_-D4_-e5_-F6'],
    ['0'.repeat(22)],
    ['-'.repeat(22)],
    ['_'.repeat(22)],
  ])('код «%s» годится', (code) => {
    expect(code).toHaveLength(22);
    expect(LinkCodes.fits(code)).toBe(true);
  });

  test.each([
    ['пустая строка', ''],
    ['21 знак', 'a'.repeat(21)],
    ['23 знака', 'a'.repeat(23)],
    ['64 знака — длина параметра Bot API', 'a'.repeat(64)],
    ['с «=» base64', `${'a'.repeat(21)}=`],
    ['с «+»', `${'a'.repeat(21)}+`],
    ['с «/»', `${'a'.repeat(21)}/`],
    ['с точкой', `${'a'.repeat(21)}.`],
    ['с пробелом', `${'a'.repeat(21)} `],
    ['с переводом строки', `${'a'.repeat(22)}\n`],
    ['кириллица', 'я'.repeat(22)],
    ['чужая буква вида', `${'a'.repeat(21)}é`],
  ])('%s — не код', (_, code) => {
    expect(LinkCodes.fits(code)).toBe(false);
    expect(LINK_CODE.test(code)).toBe(false);
  });
});
