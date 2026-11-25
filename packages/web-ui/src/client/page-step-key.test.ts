import { describe, expect, test } from 'bun:test';
import type { AddressJson } from 'dmg-ui';
import { LIST_ID } from 'dmg-ui/example';
import { PageStepKey } from './page-step-key';

// Ключ места, по которому история отличает шаг от замены: без правила
// приложения — экран корневой области (D-UI-97); с правилом — его строка;
// бросок правила — сбой в `onFault` и ключ по умолчанию.

const LIST: AddressJson = { screen: LIST_ID, params: { page: 1 } };

describe('PageStepKey', () => {
  test('без правила ключ — экран адреса, параметры в него не входят', () => {
    const key = PageStepKey.of(undefined, () => {});

    expect(key.key(LIST)).toBe(LIST_ID);
    expect(key.key({ screen: LIST_ID, params: { page: 7 } })).toBe(LIST_ID);
  });

  test('с правилом ключ — его строка; правило получает адрес как есть', () => {
    const seen: AddressJson[] = [];
    const key = PageStepKey.of(
      (address) => {
        seen.push(address);
        return `${address.screen}#страница`;
      },
      () => {},
    );

    expect(key.key(LIST)).toBe(`${LIST_ID}#страница`);
    expect(seen).toEqual([LIST]);
  });

  test('бросок правила — ключ экран; onFault без аргументов и один раз на экземпляр, хоть бросков два', () => {
    const calls: unknown[][] = [];
    const key = PageStepKey.of(
      () => {
        throw new Error('секрет-42');
      },
      (...args: unknown[]) => {
        calls.push(args);
      },
    );

    expect(key.key(LIST)).toBe(LIST_ID);
    expect(calls).toEqual([[]]);
    expect(key.key(LIST)).toBe(LIST_ID);
    expect(calls).toEqual([[]]);
  });
});
