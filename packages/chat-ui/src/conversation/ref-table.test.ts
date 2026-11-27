import { describe, expect, test } from 'bun:test';
import type { RefEntry, RefTarget } from './conversation.types';
import { RefTable } from './ref-table';

// Таблица ссылок беседы — данные: запись адресует экран и черновик номерами
// беседы. Ссылка — эпоха воплощения и счётчик в base36: не повторяется ни
// после вытеснения, ни после восстановления из снимка. Предел — 256 записей,
// вытесняются старейшие.

const EPOCH = 'abcde';
const LIST = { screen: 'exampleUi/todo/taskList', params: { page: 0 } };

const NEXT: RefTarget = {
  kind: 'action',
  screen: 1,
  revision: 1,
  action: 'next',
  label: 'Дальше',
};

const OPEN: RefTarget = { kind: 'open', address: LIST, label: 'К списку' };

/** Цель действия строки экрана `screen` на ревизии `revision`: вход — только в снимке. */
const rowOf = (screen: number, revision: number): RefTarget => ({
  kind: 'row',
  screen,
  revision,
  action: 'open',
  input: { itemId: 'task-1' },
  label: 'Хлеб',
});

const ROW = rowOf(1, 3);

/** Цель каждого из восьми видов. */
const ALL_KINDS: readonly RefTarget[] = [
  NEXT,
  { kind: 'local', screen: 1, revision: 1, local: 'toggle', label: 'Свернуть' },
  {
    kind: 'confirm',
    screen: 1,
    revision: 1,
    action: 'remove',
    yes: true,
    input: { id: 'task-1', note: ['а', 'б'] },
    label: 'Да',
  },
  { kind: 'choice', draft: 2, field: 'priority', value: 3, label: 'Высокий' },
  { kind: 'skip', draft: 2, field: 'note', label: 'Пропустить' },
  { kind: 'page', of: 'field', owner: 2, page: 1, label: 'Ещё' },
  OPEN,
  ROW,
];

/** Цель действия, отличимая по ревизии. */
const numbered = (revision: number): RefTarget => ({
  kind: 'action',
  screen: 1,
  revision,
  action: 'next',
  label: 'Дальше',
});

/** Выдать `count` ссылок подряд; ревизия цели — порядковый номер с нуля. */
const issue = (refs: RefTable, count: number): string[] =>
  Array.from({ length: count }, (_, i) => refs.add(numbered(i)));

/** Записи через круг JSON — как из снимка. */
const viaJson = (refs: RefTable): RefEntry[] =>
  JSON.parse(JSON.stringify(refs)) as RefEntry[];

describe('RefTable', () => {
  test('ссылка → цель действия с ревизией; ссылки разные', () => {
    const refs = new RefTable(EPOCH);

    const next = refs.add(NEXT);
    const open = refs.add(OPEN);

    expect(next).not.toBe(open);
    expect(refs.entry(next)).toStrictEqual({ ref: next, ...NEXT });
    expect(refs.entry(open)).toStrictEqual({ ref: open, ...OPEN });
  });

  test('неизвестная ссылка — цели нет', () => {
    const refs = new RefTable(EPOCH);
    refs.add(OPEN);

    expect(refs.entry('r999')).toBeUndefined();
    expect(refs.entry('мусор')).toBeUndefined();
    expect(refs.entry(`${EPOCH}0`)).toBeUndefined();
    expect(refs.entry('fghij1')).toBeUndefined();
  });

  test('ссылка — только [a-z0-9] и не длиннее 16: эпоха и счётчик в base36', () => {
    const refs = new RefTable(EPOCH);

    const issued = issue(refs, 1000);

    expect(issued[0]).toBe('abcde1');
    expect(issued[35]).toBe('abcde10');
    issued.forEach((ref, i) => {
      expect(ref).toBe(`${EPOCH}${(i + 1).toString(36)}`);
      expect(ref).toMatch(/^[a-z0-9]{1,16}$/);
    });
  });

  test('предел: сверх 256 записей вытесняется самая старая, её ссылка — цели нет', () => {
    const refs = new RefTable(EPOCH);
    const issued = issue(refs, 256);

    expect(refs.entry(issued[0] ?? '')).toBeDefined();
    expect(refs.toJSON()).toHaveLength(256);

    const last = refs.add(numbered(256));

    expect(refs.entry(issued[0] ?? '')).toBeUndefined();
    expect(refs.entry(issued[1] ?? '')).toMatchObject({ revision: 1 });
    expect(refs.entry(last)).toMatchObject({ revision: 256 });
    expect(refs.toJSON()).toHaveLength(256);
    expect(refs.toJSON()[0]?.ref).toBe(issued[1]);
    expect(refs.toJSON()[255]?.ref).toBe(last);
  });

  test('после вытеснения ссылки не повторяются', () => {
    const refs = new RefTable(EPOCH);

    const issued = issue(refs, 1000);

    expect(new Set(issued).size).toBe(1000);
    expect(refs.toJSON().map((entry) => entry.ref)).toEqual(issued.slice(744));
  });

  test('круг JSON таблицы — те же цели', () => {
    const refs = new RefTable(EPOCH);
    const issued = ALL_KINDS.map((target) => refs.add(target));

    const restored = new RefTable('fghij', viaJson(refs));

    issued.forEach((ref, i) => {
      expect<unknown>(restored.entry(ref)).toStrictEqual({
        ref,
        ...ALL_KINDS[i],
      });
    });
    expect(restored.toJSON()).toStrictEqual(refs.toJSON());
  });

  test('таблица из снимка держит тот же предел: новая запись вытесняет старейшую из снимка', () => {
    const refs = new RefTable(EPOCH);
    const issued = issue(refs, 256);
    const restored = new RefTable('fghij', viaJson(refs));

    const added = restored.add(NEXT);

    expect(restored.entry(issued[0] ?? '')).toBeUndefined();
    expect(restored.entry(issued[1] ?? '')).toBeDefined();
    expect(restored.entry(added)).toStrictEqual({ ref: added, ...NEXT });
    expect(restored.toJSON()).toHaveLength(256);
  });

  test('таблица из снимка с новой эпохой не повторяет ни одной прежней ссылки — и выданных после снимка', () => {
    const first = new RefTable('aaaaa');
    const before = issue(first, 10);
    const snapshot = viaJson(first);
    const lost = issue(first, 300);

    const restored = new RefTable('bbbbb', snapshot);

    expect(restored.entry(before[0] ?? '')).toMatchObject({ revision: 0 });
    for (const ref of lost) expect(restored.entry(ref)).toBeUndefined();

    const fresh = issue(restored, 300);
    const earlier = new Set([...before, ...lost]);

    expect(fresh.filter((ref) => earlier.has(ref))).toEqual([]);
    expect(fresh[0]).toBe('bbbbb1');
  });

  test('rebase переносит записи экрана с ревизией R на R + 1; записи других ревизий и экранов не трогает', () => {
    const refs = new RefTable(EPOCH);
    const targets: readonly RefTarget[] = [
      {
        kind: 'action',
        screen: 1,
        revision: 3,
        action: 'next',
        label: 'Дальше',
      },
      {
        kind: 'local',
        screen: 1,
        revision: 3,
        local: 'toggle',
        label: 'Свернуть',
      },
      {
        kind: 'confirm',
        screen: 1,
        revision: 3,
        action: 'remove',
        yes: false,
        input: { id: 'task-1' },
        label: 'Нет',
      },
      ROW,
      rowOf(1, 2),
      rowOf(2, 3),
      {
        kind: 'action',
        screen: 1,
        revision: 2,
        action: 'next',
        label: 'Дальше',
      },
      {
        kind: 'action',
        screen: 2,
        revision: 3,
        action: 'next',
        label: 'Дальше',
      },
      { kind: 'page', of: 'screen', owner: 1, page: 1, label: 'Ещё' },
      {
        kind: 'choice',
        draft: 1,
        field: 'priority',
        value: 'high',
        label: 'Высокий',
      },
      OPEN,
    ];
    const issued = targets.map((target) => refs.add(target));

    refs.rebase(1, 3, 4);

    expect<unknown>(refs.toJSON()).toStrictEqual([
      { ref: issued[0], ...targets[0], revision: 4 },
      { ref: issued[1], ...targets[1], revision: 4 },
      { ref: issued[2], ...targets[2], revision: 4 },
      { ref: issued[3], ...targets[3], revision: 4 },
      { ref: issued[4], ...targets[4] },
      { ref: issued[5], ...targets[5] },
      { ref: issued[6], ...targets[6] },
      { ref: issued[7], ...targets[7] },
      { ref: issued[8], ...targets[8] },
      { ref: issued[9], ...targets[9] },
      { ref: issued[10], ...targets[10] },
    ]);
    expect(refs.entry(issued[0] ?? '')).toMatchObject({ revision: 4 });
  });
});

describe('RefTable.drop', () => {
  test('снятые ссылки уходят из таблицы, остальные и их порядок прежние; неизвестная ссылка — не ошибка', () => {
    const refs = new RefTable(EPOCH);
    const first = refs.add(NEXT);
    const second = refs.add(OPEN);
    const third = refs.add(NEXT);

    refs.drop([second, 'zzzzz9']);

    expect(refs.entry(second)).toBeUndefined();
    expect(refs.toJSON().map((entry) => entry.ref)).toEqual([first, third]);
  });

  test('счётчик назад не идёт: следующая ссылка не повторяет снятую', () => {
    const refs = new RefTable(EPOCH);
    const dropped = refs.add(OPEN);

    refs.drop([dropped]);
    const next = refs.add(OPEN);

    expect(next).not.toBe(dropped);
    expect(refs.entry(dropped)).toBeUndefined();
    expect(refs.entry(next)).toStrictEqual({ ref: next, ...OPEN });
  });
});
