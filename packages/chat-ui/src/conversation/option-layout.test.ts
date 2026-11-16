import { describe, expect, test } from 'bun:test';
import type { Layout } from './conversation.types';
import { OptionLayout } from './option-layout';

// Раскладка вариантов под лимит мессенджера: всё кнопками; страницы кнопок с
// одной кнопкой «Ещё» по кругу; номера в тексте по 10 на страницу, когда
// кнопок страницы не остаётся хотя бы двух. Служебные кнопки (у поля —
// «Пропустить») остаются на каждой странице.

/** Номеров на страницу текста. */
const NUMBERED_PAGE = 10;

/** Кнопок на одной странице раскладки: варианты страницы, служебные и «Ещё». */
const buttonsOf = (layout: Layout, items: number, service: number): number => {
  if (layout.kind === 'all') return items + service;
  if (layout.kind === 'pages') {
    return Math.min(layout.size, items) + service + 1;
  }
  // Номера — в тексте; кнопки — служебные и «Ещё», если страниц больше одной.
  return service + (layout.count > 1 ? 1 : 0);
};

describe('OptionLayout', () => {
  test('всё влезло — all', () => {
    expect(new OptionLayout(3).of(3, 0, false)).toEqual({ kind: 'all' });
    expect(new OptionLayout(3).of(2, 1, true)).toEqual({ kind: 'all' });
    expect(new OptionLayout(3).of(0, 0, true)).toEqual({ kind: 'all' });
    expect(new OptionLayout(100).of(99, 1, true)).toEqual({ kind: 'all' });
  });

  test('сверх лимита — pages с «Ещё», size = max − service − 1', () => {
    expect(new OptionLayout(3).of(7, 0, true)).toEqual({
      kind: 'pages',
      size: 2,
      count: 4,
    });
    expect(new OptionLayout(5).of(10, 1, true)).toEqual({
      kind: 'pages',
      size: 3,
      count: 4,
    });
    expect(new OptionLayout(100).of(100, 1, true)).toEqual({
      kind: 'pages',
      size: 98,
      count: 2,
    });
  });

  test('поле с «Пропустить» на трёх вариантах — numbers по 10', () => {
    expect(new OptionLayout(3).of(4, 1, true)).toEqual({
      kind: 'numbers',
      size: NUMBERED_PAGE,
      count: 1,
    });
    expect(new OptionLayout(3).of(25, 1, true)).toEqual({
      kind: 'numbers',
      size: NUMBERED_PAGE,
      count: 3,
    });
  });

  test('вариантам экрана номера не даются', () => {
    expect(new OptionLayout(3).of(5, 0, false)).toEqual({
      kind: 'pages',
      size: 2,
      count: 3,
    });
    // Кнопок страницы меньше двух — всё равно страницы, а не номера.
    expect(new OptionLayout(3).of(5, 1, false)).toEqual({
      kind: 'pages',
      size: 1,
      count: 5,
    });
  });

  test('на каждой странице вариантов не больше max, и страницы покрывают все варианты', () => {
    const broken: unknown[] = [];

    for (let max = 3; max <= 8; max += 1) {
      for (let service = 0; service <= max - 2; service += 1) {
        for (let items = 0; items <= 30; items += 1) {
          for (const numbered of [true, false]) {
            const layout = new OptionLayout(max).of(items, service, numbered);
            const fits = buttonsOf(layout, items, service) <= max;
            const covers =
              layout.kind === 'all' ||
              (layout.size >= 1 &&
                layout.size * layout.count >= items &&
                layout.size * (layout.count - 1) < items);
            const numbers = layout.kind !== 'numbers' || numbered;
            if (!fits || !covers || !numbers) {
              broken.push({ max, service, items, numbered, layout });
            }
          }
        }
      }
    }

    expect(broken).toEqual([]);
  });
});
