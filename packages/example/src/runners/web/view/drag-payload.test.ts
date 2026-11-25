import { describe, expect, test } from 'bun:test';
import { TASK_A, TASK_B } from '../../../platform/ui';
import { DragPayload } from './drag-payload';

// Полезная нагрузка перетаскивания: собственный тип данных и JSON
// `{ kind, taskId }`, проверенный схемой. Чужое перетаскивание (текст, файл,
// ссылка из другой вкладки) не принимается: тексты людей в `taskId` — тоже.

describe('DragPayload — круг encode → parse', () => {
  for (const kind of ['row', 'card'] as const) {
    test(`вид «${kind}»: разбор возвращает то, что закодировано`, () => {
      expect(DragPayload.parse(DragPayload.encode(kind, TASK_A))).toEqual({
        kind,
        taskId: TASK_A,
      });
    });
  }

  test('закодированное — JSON ровно из двух ключей', () => {
    expect(JSON.parse(DragPayload.encode('row', TASK_B))).toEqual({
      kind: 'row',
      taskId: TASK_B,
    });
  });

  test('тип данных — собственный, не текст и не ссылка', () => {
    expect(DragPayload.MIME).toBe('application/x-example-task');
  });
});

describe('DragPayload.parse — чужое не принимается', () => {
  const foreign: [string, string][] = [
    ['чужой текст', 'просто текст из другой вкладки'],
    ['не JSON', '{kind: row'],
    ['пустая строка', ''],
    ['JSON не объект: число', '42'],
    ['JSON не объект: null', 'null'],
    ['JSON не объект: массив', '[]'],
    ['taskId не uuid', JSON.stringify({ kind: 'row', taskId: 'Хлеб' })],
    [
      'taskId — разметка',
      JSON.stringify({ kind: 'row', taskId: '<img src=x onerror=alert(1)>' }),
    ],
    ['taskId пустой', JSON.stringify({ kind: 'card', taskId: '' })],
    ['нет taskId', JSON.stringify({ kind: 'card' })],
    ['нет kind', JSON.stringify({ taskId: TASK_A })],
    ['неизвестный kind', JSON.stringify({ kind: 'zone', taskId: TASK_A })],
    [
      'лишний ключ',
      JSON.stringify({ kind: 'row', taskId: TASK_A, extra: true }),
    ],
    ['taskId — число', JSON.stringify({ kind: 'row', taskId: 7 })],
  ];

  for (const [name, raw] of foreign) {
    test(`${name} — undefined`, () => {
      expect(DragPayload.parse(raw)).toBeUndefined();
    });
  }
});

describe('DragPayload.accepts — только с собственным типом данных', () => {
  test('собственный тип — принимается', () => {
    expect(DragPayload.accepts([DragPayload.MIME])).toBe(true);
  });

  test('собственный тип среди прочих — принимается', () => {
    expect(DragPayload.accepts(['text/plain', DragPayload.MIME])).toBe(true);
  });

  for (const types of [[], ['text/plain'], ['Files'], ['text/uri-list']]) {
    test(`типы [${types.join(', ')}] — не принимаются`, () => {
      expect(DragPayload.accepts(types)).toBe(false);
    });
  }
});
