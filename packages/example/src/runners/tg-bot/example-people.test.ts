import { describe, expect, test } from 'bun:test';
import { testUuid } from 'dmg-core/testing';
import { ExamplePeople } from './example-people';

// Личность примера: id Telegram (строка `String(from.id)`) ↔ uuid учебного мира.
// Список id — из окружения (первый — A, второй — B), uuid — параметром.

const A = testUuid(1);
const B = testUuid(2);

describe('ExamplePeople — id Telegram → uuid', () => {
  const people = new ExamplePeople([111, 222], [A, B]);

  test('первый id — пользователь A, второй — B', () => {
    expect(people.uuidOf('111')).toBe(A);
    expect(people.uuidOf('222')).toBe(B);
  });

  test('чужой id — undefined', () => {
    expect(people.uuidOf('333')).toBeUndefined();
  });

  test('id не задан — undefined', () => {
    expect(people.uuidOf(undefined)).toBeUndefined();
  });

  test('нецелая и нечисловая строка — undefined', () => {
    expect(people.uuidOf('111.5')).toBeUndefined();
    expect(people.uuidOf('abc')).toBeUndefined();
    expect(people.uuidOf('')).toBeUndefined();
  });

  test('один допущенный человек: B не существует', () => {
    const single = new ExamplePeople([111], [A, B]);
    expect(single.uuidOf('111')).toBe(A);
    expect(single.uuidOf('222')).toBeUndefined();
    expect(single.idOf(B)).toBeUndefined();
  });
});

describe('ExamplePeople — uuid → id Telegram', () => {
  const people = new ExamplePeople([111, 222], [A, B]);

  test('uuid A и B — id строкой', () => {
    expect(people.idOf(A)).toBe('111');
    expect(people.idOf(B)).toBe('222');
  });

  test('несуществующий uuid — undefined', () => {
    expect(people.idOf(testUuid(9))).toBeUndefined();
  });
});
