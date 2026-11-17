import { describe, expect, test } from 'bun:test';
import { MemoryMessenger } from './memory-messenger';

// Граница общей части и мессенджеров: два подставных набора различаются
// возможностями, и общая часть видит разницу только через них. Что каждый
// набор делает с показом, правкой и окном, — `memory-messenger.test.ts`;
// схема наборов — `capabilities-schema.test.ts`; страж — `limited-messenger.test.ts`.

describe('подставные мессенджеры', () => {
  test('подставные мессенджеры различимы тестом возможностей', () => {
    const a = MemoryMessenger.editing().capabilities;
    const b = MemoryMessenger.windowed(() => 0).capabilities;

    expect(a.edit).not.toBe(b.edit);
    expect(a.options.max).not.toBe(b.options.max);
    expect(a.initiative).not.toEqual(b.initiative);
    expect(a.pressAnswer).toBeDefined();
    expect(b.pressAnswer).toBeUndefined();
  });
});
