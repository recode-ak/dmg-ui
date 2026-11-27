import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import type { Message } from '../message/message.types';
import {
  MAX_FIELD_CHOICES,
  MAX_FIELDS,
  MAX_HANDLES,
  MAX_LABEL_LENGTH,
  MAX_REFS,
} from './conversation.const';
import type { ConversationSnapshot, RefEntry } from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';

// Схема снимка беседы: пределы на массивах и строках, ссылка — `[a-z0-9]`
// до 16 знаков, номера — целые не меньше 0. Снимок экземпляра ядра внутри
// схема не проверяет — это делает ядро при восстановлении. Живое место —
// положение, хэш ключа следа (64 знака hex) и последнее сообщение по схеме
// сообщения с пределами. Путь — до 16 снимков экземпляров, их проверяет
// ядро. Внешние данные: мусор — не по схеме, без броска.

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
  { ref: 'abcde8', kind: 'home', label: 'В начало' },
];

/** Последнее сообщение живого места — со стилями, ссылкой фрагмента и вариантами. */
const PLACE: Message = {
  kind: 'text',
  text: [
    { text: 'Мои задачи', styles: ['bold'] },
    { text: '\nХлеб — ', styles: [] },
    { text: 'карточка', styles: [], link: 'https://example.org/task' },
  ],
  options: [
    { ref: 'abcde1', label: 'Добавить' },
    { ref: 'abcde8', label: 'В начало' },
  ],
};

const SNAPSHOT: ConversationSnapshot = {
  version: 1,
  person: '00000000-0000-4000-8000-000000000001',
  serial: 3,
  refs: REFS,
  seen: ['u1', 'u2'],
  notified: ['b'.repeat(64), 'c'.repeat(64)],
  screen: {
    serial: 2,
    instance: { address: LIST, state: { open: true }, revision: 4 },
    shown: 'a'.repeat(64),
    handles: ['h1', 'h2'],
    page: 0,
    latest: true,
    history: '0123456789abcdef'.repeat(4),
    message: PLACE,
  },
  draft: {
    serial: 3,
    screen: 2,
    target: { kind: 'action', action: 'add', revision: 4 },
    fields: [
      { name: 'title', label: 'Название', kind: 'string', optional: false },
      {
        name: 'priority',
        label: 'Приоритет',
        kind: 'choice',
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

/** Запись «Назад» живого экрана. */
const BACK = { ref: 'abcde9', kind: 'back', screen: 2, label: 'Назад' };

/** Запись действия строки живого экрана: вход строки — только в снимке. */
const ROW: RefEntry = {
  ref: 'abcdea',
  kind: 'row',
  screen: 2,
  revision: 4,
  action: 'open',
  input: { itemId: 'task-1' },
  label: 'Хлеб',
};

/** Путь из `count` снимков экземпляров разных экранов, старые первыми. */
const steps = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    address: { screen: `exampleUi/todo/step${i}`, params: { page: i } },
    state: { selected: [`задача-${i}`] },
    revision: i,
  }));

/** `count` записей с разными ссылками. */
const manyRefs = (count: number) =>
  Array.from({ length: count }, (_, i) =>
    openRef(`abcde${(i + 1).toString(36)}`),
  );

const manySeen = (count: number) =>
  Array.from({ length: count }, (_, i) => `u${i}`);

/** `count` ключей отсева уведомлений: SHA-256 в hex — 64 знака. */
const manyNotified = (count: number) =>
  Array.from({ length: count }, (_, i) => i.toString(16).padStart(64, '0'));

/** Снимок с живым экраном, у которого `handles` — `count` сообщений. */
const withHandles = (count: number) => ({
  ...SNAPSHOT,
  screen: {
    ...SNAPSHOT.screen,
    handles: Array.from({ length: count }, (_, i) => `h${i}`),
  },
});

/** Снимок, у живого места которого последнее сообщение — `message`. */
const withMessage = (message: unknown) => ({
  ...SNAPSHOT,
  screen: { ...SNAPSHOT.screen, message },
});

/** Сообщение места из `count` фрагментов без стилей. */
const fragments = (count: number) => ({
  ...PLACE,
  text: Array.from({ length: count }, (_, i) => ({
    text: `ф${i}`,
    styles: [],
  })),
});

/** Сообщение места с одним фрагментом-ссылкой длиной `length`. */
const linked = (length: number) => ({
  ...PLACE,
  text: [{ text: 'карточка', styles: [], link: 'h'.repeat(length) }],
});

/** Сообщение места с `count` вариантами. */
const options = (count: number) => ({
  ...PLACE,
  options: Array.from({ length: count }, (_, i) => ({
    ref: `abc${i.toString(36)}`,
    label: `В${i}`,
  })),
});

/** Снимок с черновиком: `count` полей, все отвечены. */
const withFields = (count: number) => {
  const names = Array.from({ length: count }, (_, i) => `f${i}`);
  return {
    ...SNAPSHOT,
    draft: {
      ...SNAPSHOT.draft,
      fields: names.map((name) => ({ name, label: name, optional: true })),
      answered: names,
    },
  };
};

/** Последнее сообщение места с акцентом варианта и моментом во фрагменте. */
const PLACE_RICH: Message = {
  kind: 'text',
  text: [
    { text: 'Срок: ', styles: [] },
    {
      text: '18 ноября',
      styles: ['bold'],
      moment: { at: 1_800_000_000, show: 'date' },
    },
  ],
  options: [
    { ref: 'abcde1', label: 'Выполнить', accent: 'positive' },
    { ref: 'abcde8', label: 'Удалить', accent: 'danger' },
    { ref: 'abcde2', label: 'Подробнее' },
  ],
};

describe('ConversationSnapshotSchema', () => {
  test('снимок со всеми частями проходит схему и круг JSON без изменений', () => {
    const round = JSON.parse(JSON.stringify(SNAPSHOT));

    expect(round).toStrictEqual(SNAPSHOT);
    expect(v.parse(ConversationSnapshotSchema, round)).toStrictEqual(SNAPSHOT);
  });

  test('снимок с путём и записью back проходит схему и круг JSON без изменений', () => {
    const value = { ...SNAPSHOT, refs: [...REFS, BACK], path: steps(16) };
    const round = JSON.parse(JSON.stringify(value));

    expect(round).toStrictEqual(value);
    expect<unknown>(v.parse(ConversationSnapshotSchema, round)).toStrictEqual(
      value,
    );
  });

  test('снимок с записью row проходит схему и круг JSON без изменений', () => {
    const value = { ...SNAPSHOT, refs: [...REFS, ROW] };
    const round = JSON.parse(JSON.stringify(value));

    expect(round).toStrictEqual(value);
    expect<unknown>(v.parse(ConversationSnapshotSchema, round)).toStrictEqual(
      value,
    );
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
    ['notified 128', { ...BARE, notified: manyNotified(128) }],
    ['ключ в notified длиной 64', { ...BARE, notified: ['x'.repeat(64)] }],
    ['пустой notified', { ...BARE, notified: [] }],
    ['ссылка длиной 16', { ...BARE, refs: [openRef('a'.repeat(16))] }],
    ['фрагментов сообщения места 1024', withMessage(fragments(1024))],
    ['ссылка фрагмента длиной 2048', withMessage(linked(2048))],
    [
      'текст фрагмента длиной 65 536',
      withMessage({
        ...PLACE,
        text: [{ text: 'т'.repeat(65_536), styles: [] }],
      }),
    ],
    [`вариантов сообщения места ${MAX_REFS}`, withMessage(options(MAX_REFS))],
    ['путь из 16 элементов', { ...BARE, path: steps(16) }],
    ['пустой путь', { ...BARE, path: [] }],
    ['запись back', { ...BARE, refs: [BACK] }],
    [
      'место без положения, хэша и сообщения (снимок прежней формы)',
      {
        ...SNAPSHOT,
        screen: {
          serial: 2,
          instance: SNAPSHOT.screen?.instance,
          shown: 'a'.repeat(64),
          handles: ['h1'],
          page: 0,
        },
      },
    ],
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
      'запись back без номера экрана',
      { ...BARE, refs: [{ ref: 'abcde1', kind: 'back', label: 'Назад' }] },
    ],
    [
      'запись row без номера экрана',
      {
        ...BARE,
        refs: [
          {
            ref: 'abcde1',
            kind: 'row',
            revision: 4,
            action: 'open',
            input: { itemId: 'task-1' },
            label: 'Хлеб',
          },
        ],
      },
    ],
    [
      'запись неизвестного вида',
      { ...BARE, refs: [{ ref: 'abcde1', kind: 'jump', label: 'Прыжок' }] },
    ],
    ['ссылок 257', { ...BARE, refs: manyRefs(257) }],
    ['путь из 17 элементов', { ...BARE, path: steps(17) }],
    ['путь не массив', { ...BARE, path: { 0: steps(1)[0] } }],
    [
      'запись back с номером экрана строкой',
      { ...BARE, refs: [{ ...BACK, screen: '2' }] },
    ],
    [
      'запись back с отрицательным номером экрана',
      { ...BARE, refs: [{ ...BACK, screen: -1 }] },
    ],
    [
      'запись back с подписью длиннее 1024',
      { ...BARE, refs: [{ ...BACK, label: 'л'.repeat(MAX_LABEL_LENGTH + 1) }] },
    ],
    ['seen 129', { ...BARE, seen: manySeen(129) }],
    ['id в seen длиннее 256', { ...BARE, seen: ['x'.repeat(257)] }],
    ['notified 129', { ...BARE, notified: manyNotified(129) }],
    ['ключ в notified длиннее 64', { ...BARE, notified: ['x'.repeat(65)] }],
    ['notified не массив строк', { ...BARE, notified: [1] }],
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
    ['handles 33', withHandles(33)],
    ['полей черновика 65', withFields(65)],
    [
      'answered 65',
      {
        ...SNAPSHOT,
        draft: { ...SNAPSHOT.draft, answered: manySeen(65) },
      },
    ],
    ['person длиннее 64', { ...BARE, person: 'p'.repeat(65) }],
    [
      'отпечаток длиннее 64',
      { ...SNAPSHOT, screen: { ...SNAPSHOT.screen, shown: 'a'.repeat(65) } },
    ],
    [
      'подпись длиннее 1024',
      { ...BARE, refs: [{ ...REFS[0], label: 'л'.repeat(1025) }] },
    ],
    [
      'имя действия длиннее 256',
      { ...BARE, refs: [{ ...REFS[0], action: 'a'.repeat(257) }] },
    ],
    [
      'поле шага длиннее 256',
      { ...BARE, refs: [{ ...REFS[3], field: 'f'.repeat(257) }] },
    ],
    [
      'имя поля черновика длиннее 256',
      {
        ...SNAPSHOT,
        draft: {
          ...SNAPSHOT.draft,
          fields: [{ name: 'f'.repeat(257), label: 'Поле', optional: true }],
        },
      },
    ],
    [
      'положение не boolean',
      { ...SNAPSHOT, screen: { ...SNAPSHOT.screen, latest: 'да' } },
    ],
    [
      'хэш ключа следа не hex',
      { ...SNAPSHOT, screen: { ...SNAPSHOT.screen, history: 'z'.repeat(64) } },
    ],
    [
      'хэш ключа следа длиннее 64',
      { ...SNAPSHOT, screen: { ...SNAPSHOT.screen, history: 'a'.repeat(65) } },
    ],
    ['сообщение места не по схеме', withMessage({ kind: 'text', text: [] })],
    ['сообщение места другого вида', withMessage({ ...PLACE, kind: 'image' })],
    ['фрагментов сообщения места 1025', withMessage(fragments(1025))],
    [
      'текст фрагмента длиннее 65 536',
      withMessage({
        ...PLACE,
        text: [{ text: 'т'.repeat(65_537), styles: [] }],
      }),
    ],
    ['ссылка фрагмента длиннее 2048', withMessage(linked(2049))],
    [
      'стиль фрагмента не из списка',
      withMessage({ ...PLACE, text: [{ text: 'т', styles: ['underline'] }] }),
    ],
    [
      `вариантов сообщения места ${MAX_REFS + 1}`,
      withMessage(options(MAX_REFS + 1)),
    ],
    [
      'ссылка варианта сообщения места R1 (заглавная)',
      withMessage({ ...PLACE, options: [{ ref: 'R1', label: 'Да' }] }),
    ],
    [
      'подпись варианта сообщения места длиннее 1024',
      withMessage({
        ...PLACE,
        options: [{ ref: 'abcde1', label: 'л'.repeat(MAX_LABEL_LENGTH + 1) }],
      }),
    ],
  ])('мусор — не по схеме, без броска: %s', (_, value) => {
    expect(() => v.safeParse(ConversationSnapshotSchema, value)).not.toThrow();
    expect(valid(value)).toBe(false);
  });

  test('снимок крупного экрана на пределах проходит схему', () => {
    const label = 'л'.repeat(MAX_LABEL_LENGTH);
    const names = Array.from({ length: MAX_FIELDS }, (_, i) => `f${i}`);
    const choices = Array.from({ length: MAX_FIELD_CHOICES }, (_, i) => ({
      value: i,
      label,
    }));
    const big = {
      ...SNAPSHOT,
      screen: {
        ...SNAPSHOT.screen,
        handles: Array.from({ length: MAX_HANDLES }, (_, i) => `h${i}`),
      },
      draft: {
        ...SNAPSHOT.draft,
        fields: names.map((name) => ({
          name,
          label,
          optional: true,
          choices,
        })),
        answered: names,
      },
    };

    expect(valid(big)).toBe(true);
  });

  test('элементы пути схемой не проверяются: мусор в них проходит схему — его отвергает ядро при «Назад»', () => {
    const value = {
      ...BARE,
      path: ['мусор', null, { revision: -1 }, [1, 2]],
    };

    expect<unknown>(v.parse(ConversationSnapshotSchema, value)).toStrictEqual(
      value,
    );
  });

  test('instance схемой не проверяется: мусор в нём проходит схему — его отвергает ядро', () => {
    for (const instance of ['мусор', null, { revision: -1 }, [1, 2]]) {
      const value = { ...SNAPSHOT, screen: { ...SNAPSHOT.screen, instance } };

      expect<unknown>(v.parse(ConversationSnapshotSchema, value)).toStrictEqual(
        value,
      );
    }
  });

  test('акцент вариантов и момент фрагмента проходят круг JSON и схему без потерь', () => {
    const value = withMessage(PLACE_RICH);
    const round = JSON.parse(JSON.stringify(value));

    const parsed = v.parse(ConversationSnapshotSchema, round);

    expect<unknown>(parsed).toStrictEqual(value);
    expect<unknown>(parsed.screen?.message).toStrictEqual(PLACE_RICH);
  });

  test('снимок места без акцента и момента (прежний) читается как есть, без полей', () => {
    const parsed = v.parse(ConversationSnapshotSchema, withMessage(PLACE));
    const message = parsed.screen?.message;

    expect(message).toStrictEqual(PLACE);
    expect('accent' in (message?.options[0] ?? {})).toBe(false);
    expect('moment' in (message?.text[0] ?? {})).toBe(false);
  });

  test.each([
    [
      'акцент вне перечня',
      { ...PLACE, options: [{ ref: 'abcde1', label: 'А', accent: 'red' }] },
    ],
    [
      'вид показа момента вне перечня',
      {
        ...PLACE,
        text: [{ text: 'х', styles: [], moment: { at: 1, show: 'week' } }],
      },
    ],
    [
      'at момента дробное',
      {
        ...PLACE,
        text: [{ text: 'х', styles: [], moment: { at: 1.5, show: 'date' } }],
      },
    ],
    [
      'at момента отрицательное',
      {
        ...PLACE,
        text: [{ text: 'х', styles: [], moment: { at: -1, show: 'date' } }],
      },
    ],
    [
      'момент без show',
      { ...PLACE, text: [{ text: 'х', styles: [], moment: { at: 1 } }] },
    ],
  ])('сообщение места с недопустимым полем не по схеме: %s', (_, message) => {
    expect(valid(withMessage(message))).toBe(false);
  });
});

/** Снимок, у которого единственное поле черновика — `field`. */
const withField = (field: unknown) => ({
  ...SNAPSHOT,
  draft: { ...SNAPSHOT.draft, fields: [field] },
});

const PAGE_FIELD = {
  name: 'page',
  label: 'Страница',
  kind: 'number',
  optional: false,
  hint: 'Номер страницы списка, с первой',
  example: 2,
  limits: { min: 1, max: 99, integer: true },
};

describe('ConversationSnapshotSchema: поле черновика — вид, подсказка, пример, пределы', () => {
  test('поле с kind, hint, example и limits проходит круг JSON и схему без потерь', () => {
    const value = withField(PAGE_FIELD);
    const round = JSON.parse(JSON.stringify(value));

    expect<unknown>(v.parse(ConversationSnapshotSchema, round)).toStrictEqual(
      value,
    );
  });

  test.each(['string', 'number', 'boolean', 'date', 'choice'])(
    'вид %s проходит схему',
    (kind) => {
      const value = withField({ ...PAGE_FIELD, kind });

      expect(valid(value)).toBe(true);
    },
  );

  test.each([
    ['строка', 'Купить хлеб'],
    ['число', 2],
    ['булево', false],
  ])('пример — %s проходит круг без потерь', (_, example) => {
    const value = withField({ ...PAGE_FIELD, example });

    expect<unknown>(
      v.parse(ConversationSnapshotSchema, JSON.parse(JSON.stringify(value))),
    ).toStrictEqual(value);
  });

  test('пределы длины строки проходят круг без потерь', () => {
    const field = {
      name: 'title',
      label: 'Название',
      kind: 'string',
      optional: false,
      limits: { minLength: 1, maxLength: 80 },
    };
    const value = withField(field);

    expect<unknown>(v.parse(ConversationSnapshotSchema, value)).toStrictEqual(
      value,
    );
  });

  test('старый снимок без kind читается: kind получает умолчание string', () => {
    const old = { name: 'title', label: 'Название', optional: false };

    const parsed = v.parse(ConversationSnapshotSchema, withField(old));

    expect(parsed.draft?.fields[0]).toStrictEqual({ ...old, kind: 'string' });
  });

  test('старый снимок без hint, example и limits — ключей в прочитанном поле нет', () => {
    const parsed = v.parse(
      ConversationSnapshotSchema,
      withField({ name: 'a', label: 'А', optional: true }),
    );
    const field = parsed.draft?.fields[0];

    expect(field).not.toHaveProperty('hint');
    expect(field).not.toHaveProperty('example');
    expect(field).not.toHaveProperty('limits');
  });

  test('hint и example длиной MAX_LABEL_LENGTH проходят схему', () => {
    const long = 'а'.repeat(MAX_LABEL_LENGTH);

    expect(valid(withField({ ...PAGE_FIELD, hint: long }))).toBe(true);
    expect(valid(withField({ ...PAGE_FIELD, example: long }))).toBe(true);
  });

  test.each([
    ['вид вне перечня', { ...PAGE_FIELD, kind: 'weird' }],
    [
      'hint длиннее MAX_LABEL_LENGTH',
      { ...PAGE_FIELD, hint: 'а'.repeat(MAX_LABEL_LENGTH + 1) },
    ],
    [
      'example-строка длиннее MAX_LABEL_LENGTH',
      { ...PAGE_FIELD, example: 'а'.repeat(MAX_LABEL_LENGTH + 1) },
    ],
    ['hint не строка', { ...PAGE_FIELD, hint: 1 }],
    ['example — массив', { ...PAGE_FIELD, example: [1] }],
    ['example — null', { ...PAGE_FIELD, example: null }],
    ['limits.min не число', { ...PAGE_FIELD, limits: { min: '1' } }],
    ['limits.integer не булево', { ...PAGE_FIELD, limits: { integer: 1 } }],
    [
      'limits.maxLength не число',
      { ...PAGE_FIELD, limits: { maxLength: 'a' } },
    ],
  ])('мусор — %s — не по схеме', (_, field) => {
    expect(valid(withField(field))).toBe(false);
  });
});
