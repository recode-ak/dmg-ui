import { describe, expect, test } from 'bun:test';
import { MAX_SEEN } from './conversation.const';
import { SeenIds } from './seen-ids';

// Отсев повтора по id: новый id запоминается, повтор отсеивается; предел —
// 128 id по умолчанию или свой параметром (второй отсев — уведомления),
// сверх него вытесняется самый старый.

/** id `s0`, `s1`, … по порядку. */
const ids = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `s${from + i}`);

describe('SeenIds — предел', () => {
  test('свой предел: сверх него вытесняется самый старый, повтор не освежает', () => {
    const seen = new SeenIds([], 3);
    for (const id of ids(0, 3)) expect(seen.accept(id)).toBe(true);

    expect(seen.accept('s1')).toBe(false);
    expect(seen.accept('s3')).toBe(true);

    expect(seen.toJSON()).toEqual(ids(1, 3));
    expect(seen.accept('s0')).toBe(true);
    expect(seen.accept('s3')).toBe(false);
  });

  test('из снимка сверх своего предела — остаются свежие; без параметра предел MAX_SEEN', () => {
    const limited = new SeenIds(ids(0, 5), 3);
    const byDefault = new SeenIds(ids(0, MAX_SEEN + 1));

    expect(limited.toJSON()).toEqual(ids(2, 3));
    expect(byDefault.toJSON()).toEqual(ids(1, MAX_SEEN));
    expect(byDefault.accept('s0')).toBe(true);
  });
});

describe('SeenIds — отсев', () => {
  test('повтор id — отсеян', () => {
    const seen = new SeenIds();

    expect(seen.accept('a')).toBe(true);
    expect(seen.accept('a')).toBe(false);
    expect(seen.accept('b')).toBe(true);
    expect(seen.accept('a')).toBe(false);
    expect(seen.toJSON()).toEqual(['a', 'b']);
  });

  test('предел: после 128 новых самый старый id снова принимается', () => {
    const seen = new SeenIds();
    for (const id of ids(0, 128)) expect(seen.accept(id)).toBe(true);

    expect(seen.toJSON()).toEqual(ids(0, 128));

    expect(seen.accept('s128')).toBe(true);

    expect(seen.toJSON()).toEqual(ids(1, 128));
    expect(seen.accept('s1')).toBe(false);
    expect(seen.accept('s0')).toBe(true);
  });

  test('повтор не освежает id: вытесняется принятый первым', () => {
    const seen = new SeenIds();
    for (const id of ids(0, 128)) seen.accept(id);

    expect(seen.accept('s0')).toBe(false);
    expect(seen.toJSON()).toEqual(ids(0, 128));

    seen.accept('s128');

    expect(seen.toJSON()).toEqual(ids(1, 128));
  });

  test('круг JSON — тот же отсев', () => {
    const seen = new SeenIds();
    for (const id of ids(0, 128)) seen.accept(id);

    const restored = new SeenIds(JSON.parse(JSON.stringify(seen)));

    expect(restored.toJSON()).toEqual(ids(0, 128));
    expect(restored.accept('s0')).toBe(false);
    expect(restored.accept('s127')).toBe(false);
    expect(restored.accept('новый')).toBe(true);
    expect(restored.toJSON()).toEqual([...ids(1, 127), 'новый']);
    expect(restored.accept('s0')).toBe(true);
  });
});
