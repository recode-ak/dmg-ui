import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import type { ConversationSnapshot, RefEntry } from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';

// Схема снимка беседы: пределы на массивах и строках, ссылка — `[a-z0-9]`
// до 16 знаков, номера — целые не меньше 0. Снимок экземпляра ядра внутри
// схема не проверяет — это делает ядро при восстановлении. Внешние данные:
// мусор — не по схеме, без броска.

const LIST = { screen: 'exampleUi/todo/taskList', params: { page: 0 } };

const REFS: readonly RefEntry[] = [
  {
    ref: 'abcde1',
    kind: 'action',
    screen: 2,
    revision: 4,
    action: 'add',
    label: 'Добавить',
  },
  {
    ref: 'abcde2',
    kind: 'local',
    screen: 2,
    revision: 4,
    local: 'toggle',
    label: 'Свернуть',
  },
  {
    ref: 'abcde3',
    kind: 'confirm',
    screen: 2,
    revision: 4,
    action: 'remove',
    yes: true,
    input: { id: 'task-1', tags: ['а'] },
    label: 'Да',
  },
  {
    ref: 'abcde4',
    kind: 'choice',
    draft: 3,
    field: 'priority',
    value: 1,
    label: 'Низкий',
  },
  { ref: 'abcde5', kind: 'skip', draft: 3, field: 'note', label: 'Пропустить' },
  {
    ref: 'abcde6',
    kind: 'page',
    of: 'screen',
    owner: 2,
    page: 1,
    label: 'Ещё',
  },
  { ref: 'abcde7', kind: 'open', address: LIST, label: 'К списку' },
];

const SNAPSHOT: ConversationSnapshot = {
  version: 1,
  person: '00000000-0000-4000-8000-000000000001',
  serial: 3,
  refs: REFS,
  seen: ['u1', 'u2'],
  screen: {
    serial: 2,
    instance: { address: LIST, state: { open: true }, revision: 4 },
    shown: 'a'.repeat(64),
    handles: ['h1', 'h2'],
    page: 0,
  },
  draft: {
    serial: 3,
    screen: 2,
    target: { kind: 'action', action: 'add', revision: 4 },
    fields: [
      { name: 'title', label: 'Название', optional: false },
      {
        name: 'priority',
        label: 'Приоритет',
        optional: true,
        choices: [
          { value: 1, label: 'Низкий' },
          { value: 3, label: 'Высокий' },
        ],
        initial: 1,
      },
    ],
    values: { title: 'Хлеб' },
    answered: ['title'],
    page: 0,
  },
};

const BARE: ConversationSnapshot = {
  version: 1,
  person: '00000000-0000-4000-8000-000000000001',
  serial: 0,
  refs: [],
  seen: [],
};

const valid = (value: unknown) =>
  v.safeParse(ConversationSnapshotSchema, value).success;

/** Запись перехода по ссылке `ref`. */
const openRef = (ref: string) => ({
  ref,
  kind: 'open',
  address: LIST,
  label: 'К списку',
});

/** `count` записей с разными ссылками. */
const manyRefs = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    openRef(`abcde${(i + 1).toString(36)}`),
  );

const manySeen = (count: number) =>
  Array.from({ length: count }, (_, i) => `u${i}`);

describe('ConversationSnapshotSchema', () => {
  test('снимок со всеми частями проходит схему и круг JSON без изменений', () => {
    const round = JSON.parse(JSON.stringify(SNAPSHOT));

    expect(round).toStrictEqual(SNAPSHOT);
    expect(v.parse(ConversationSnapshotSchema, round)).toStrictEqual(SNAPSHOT);
  });

  test('снимок без экрана и черновика — по схеме', () => {
    expect(v.parse(ConversationSnapshotSchema, BARE)).toStrictEqual(BARE);
  });

  test('черновик локального действия — по схеме', () => {
    const local = {
      ...SNAPSHOT,
      draft: {
        ...SNAPSHOT.draft,
        target: { kind: 'local', local: 'filter', revision: 4 },
      },
    };

    expect(valid(local)).toBe(true);
  });

  test.each([
    ['ссылок 256', { ...BARE, refs: manyRefs(256) }],
    ['seen 128', { ...BARE, seen: manySeen(128) }],
    ['id в seen длиной 256', { ...BARE, seen: ['x'.repeat(256)] }],
    ['ссылка длиной 16', { ...BARE, refs: [openRef('a'.repeat(16))] }],
  ])('на пределе — по схеме: %s', (_, value) => {
    expect(valid(value)).toBe(true);
  });

  test.each([
    ['строка', 'снимок'],
    ['null', null],
    ['массив', [SNAPSHOT]],
    ['version: 2', { ...SNAPSHOT, version: 2 }],
    ['ссылка R1 (заглавная)', { ...BARE, refs: [openRef('R1')] }],
    ['ссылка длиннее 16', { ...BARE, refs: [openRef('a'.repeat(17))] }],
    ['пустая ссылка', { ...BARE, refs: [openRef('')] }],
    [
      'запись неизвестного вида',
      { ...BARE, refs: [{ ref: 'abcde1', kind: 'back', label: 'Назад' }] },
    ],
    ['ссылок 257', { ...BARE, refs: manyRefs(257) }],
    ['seen 129', { ...BARE, seen: manySeen(129) }],
    ['id в seen длиннее 256', { ...BARE, seen: ['x'.repeat(257)] }],
    ['отрицательный номер снимка', { ...SNAPSHOT, serial: -1 }],
    ['дробный номер снимка', { ...SNAPSHOT, serial: 1.5 }],
    [
      'отрицательный номер экрана',
      { ...SNAPSHOT, screen: { ...SNAPSHOT.screen, serial: -1 } },
    ],
    [
      'отрицательный номер черновика',
      { ...SNAPSHOT, draft: { ...SNAPSHOT.draft, serial: -1 } },
    ],
    [
      'отрицательный номер экрана в записи',
      { ...BARE, refs: [{ ...REFS[0], screen: -1 }] },
    ],
  ])('мусор — не по схеме, без броска: %s', (_, value) => {
    expect(() => v.safeParse(ConversationSnapshotSchema, value)).not.toThrow();
    expect(valid(value)).toBe(false);
  });

  test('instance схемой не проверяется: мусор в нём проходит схему — его отвергает ядро', () => {
    for (const instance of ['мусор', null, { revision: -1 }, [1, 2]]) {
      const value = { ...SNAPSHOT, screen: { ...SNAPSHOT.screen, instance } };

      expect<unknown>(v.parse(ConversationSnapshotSchema, value)).toStrictEqual(
        value,
      );
    }
  });
});
