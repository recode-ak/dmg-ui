import { describe, expect, test } from 'bun:test';
import { SeenSignals } from './seen-signals';

// Отсев повтора сигналов по id: новый id запоминается, повтор отсеивается.
// Предел — 128 id, сверх него вытесняется самый старый; данные — в снимке
// беседы, старые первыми.

/** id `s0`, `s1`, … по порядку. */
const ids = (from: number, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `s${from + i}`);

describe('SeenSignals', () => {
  test('повтор id — отсеян', () => {
    const seen = new SeenSignals();

    expect(seen.accept('a')).toBe(true);
    expect(seen.accept('a')).toBe(false);
    expect(seen.accept('b')).toBe(true);
    expect(seen.accept('a')).toBe(false);
    expect(seen.toJSON()).toEqual(['a', 'b']);
  });

  test('предел: после 128 новых самый старый id снова принимается', () => {
    const seen = new SeenSignals();
    for (const id of ids(0, 128)) expect(seen.accept(id)).toBe(true);

    expect(seen.toJSON()).toEqual(ids(0, 128));

    expect(seen.accept('s128')).toBe(true);

    expect(seen.toJSON()).toEqual(ids(1, 128));
    expect(seen.accept('s1')).toBe(false);
    expect(seen.accept('s0')).toBe(true);
  });

  test('повтор не освежает id: вытесняется принятый первым', () => {
    const seen = new SeenSignals();
    for (const id of ids(0, 128)) seen.accept(id);

    expect(seen.accept('s0')).toBe(false);
    expect(seen.toJSON()).toEqual(ids(0, 128));

    seen.accept('s128');

    expect(seen.toJSON()).toEqual(ids(1, 128));
  });

  test('круг JSON — тот же отсев', () => {
    const seen = new SeenSignals();
    for (const id of ids(0, 128)) seen.accept(id);

    const restored = new SeenSignals(JSON.parse(JSON.stringify(seen)));

    expect(restored.toJSON()).toEqual(ids(0, 128));
    expect(restored.accept('s0')).toBe(false);
    expect(restored.accept('s127')).toBe(false);
    expect(restored.accept('новый')).toBe(true);
    expect(restored.toJSON()).toEqual([...ids(1, 127), 'новый']);
    expect(restored.accept('s0')).toBe(true);
  });
});
