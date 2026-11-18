import { describe, expect, test } from 'bun:test';
import { ManualPageClock } from '../../testing';
import { SEEN_LIMIT, SEEN_TTL_MS } from './page-client.const';
import { PageSeenKeys } from './page-seen-keys';

// Отсев повторов вкладки: ключи с пределом числа и сроком от первого приёма
// по часам вкладки. Часы — подставные, время сдвигает тест.

const keys = (spec: { limit?: number; ttl?: number } = {}) => {
  const clock = new ManualPageClock();
  const seen = new PageSeenKeys({
    limit: spec.limit ?? SEEN_LIMIT,
    ttl: spec.ttl ?? SEEN_TTL_MS,
    clock,
  });
  return { clock, seen };
};

describe('PageSeenKeys', () => {
  test('пределы вкладки — 256 ключей и час', () => {
    expect(SEEN_LIMIT).toBe(256);
    expect(SEEN_TTL_MS).toBe(60 * 60 * 1000);
  });

  test('новый ключ — has ложно; после add — истинно', () => {
    const { seen } = keys();

    expect(seen.has('a')).toBe(false);
    seen.add('a');
    expect(seen.has('a')).toBe(true);
    expect(seen.has('b')).toBe(false);
  });

  test('предел: 256 ключей помнятся; 257-й вытесняет первый, остальные помнятся', () => {
    const { seen } = keys();
    const all = Array.from({ length: SEEN_LIMIT + 1 }, (_, n) => `k-${n}`);

    for (const key of all.slice(0, SEEN_LIMIT)) seen.add(key);
    expect(all.slice(0, SEEN_LIMIT).every((key) => seen.has(key))).toBe(true);
    seen.add(`k-${SEEN_LIMIT}`);

    expect(seen.has('k-0')).toBe(false);
    expect(all.slice(1).every((key) => seen.has(key))).toBe(true);
  });

  test('повтор add того же ключа места не занимает: вытеснения нет', () => {
    const { seen } = keys({ limit: 2 });

    seen.add('a');
    seen.add('a');
    seen.add('b');

    expect(seen.has('a')).toBe(true);
    expect(seen.has('b')).toBe(true);
  });

  test('срок: через ttl − 1 мс ключ есть, ровно через ttl — истёк', () => {
    const { clock, seen } = keys();
    seen.add('a');

    clock.advance(SEEN_TTL_MS - 1);
    expect(seen.has('a')).toBe(true);
    clock.advance(1);
    expect(seen.has('a')).toBe(false);
  });

  test('повтор add срок не продлевает: срок — от первого приёма', () => {
    const { clock, seen } = keys({ ttl: 100 });
    seen.add('a');

    clock.advance(99);
    seen.add('a');
    clock.advance(1);

    expect(seen.has('a')).toBe(false);
  });

  test('истёкшие уходят, неистёкший за ними остаётся до своего срока', () => {
    const { clock, seen } = keys({ ttl: 100 });
    seen.add('a');
    clock.advance(10);
    seen.add('b');
    clock.advance(30);
    seen.add('c');

    clock.advance(60);
    expect(seen.has('a')).toBe(false);
    expect(seen.has('b')).toBe(true);
    expect(seen.has('c')).toBe(true);
    clock.advance(10);
    expect(seen.has('b')).toBe(false);
    expect(seen.has('c')).toBe(true);
  });

  test('часы назад — ничего не истекает и не бросает; вперёд за срок — истекает', () => {
    const { clock, seen } = keys({ ttl: 100 });
    clock.advance(1000);
    seen.add('a');

    clock.advance(-500);
    seen.add('b');

    expect(seen.has('a')).toBe(true);
    expect(seen.has('b')).toBe(true);
    clock.advance(700);
    expect(seen.has('a')).toBe(false);
    expect(seen.has('b')).toBe(false);
  });
});
