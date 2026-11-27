import { describe, expect, test } from 'bun:test';
import { ActionRows } from './action-rows';
import { CodeDefect } from './code-defect';

// Защита рантайма за UI-38: вход не из одного поля, данные не той формы
// (граф пропущен) и повтор ключа — дефект; путь, порядок и отсутствующий родитель —
// `screen-instance.rows.test.ts`.

const SPEC = { list: 'items', key: 'id', label: 'title' };
const WHERE = 'Экран board, действие pick';
const rows = new ActionRows(SPEC, ['itemId'], WHERE);

describe('ActionRows — дефект кода экрана', () => {
  test('у входа действия строки не одно поле — CodeDefect при сборке', () => {
    expect(() => new ActionRows(SPEC, ['a', 'b'], WHERE)).toThrow(
      'у входа действия строки не одно поле',
    );
  });

  test('данные не той формы — CodeDefect с путём, без значений', () => {
    const run = () => rows.of({ items: 'секрет' });

    expect(run).toThrow(CodeDefect);
    expect(run).toThrow(
      'Экран board, действие pick: строки items — данные не той формы',
    );
    expect(run).not.toThrow('секрет');
  });

  test('ключ строки повторяется — CodeDefect', () => {
    const data = {
      items: [
        { id: 'a', title: 'Первая' },
        { id: 'a', title: 'Вторая' },
      ],
    };

    expect(() => rows.of(data)).toThrow('ключи строк повторяются');
  });
});
