import { describe, expect, test } from 'bun:test';
import { type ActionField, ActionInput } from 'dmg-ui';
import * as v from 'valibot';
import type { DraftJson } from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';
import { InputDraft } from './input-draft';

// Вход действия по шагам — данные черновика беседы: поля из
// `ActionView.fields` по порядку, текст — строка, вариант — `Choice.value`
// (нажатием, подписью или номером), необязательное поле можно пропустить;
// вход готов один раз — после последнего поля. Поля — локального входа с
// тремя полями: на учебном примере столько полей у действия нет.

const SendInput = v.object({
  title: v.pipe(v.string(), v.description('Название')),
  urgency: v.pipe(v.number(), v.description('Срочность')),
  note: v.optional(v.pipe(v.string(), v.description('Заметка'))),
});

const URGENCY = [
  { value: 1, label: 'Обычно' },
  { value: 2, label: 'Срочно' },
] as const;

/** Поля локального входа; у срочности — варианты, как их даёт код экрана. */
const fields = (): readonly ActionField[] =>
  new ActionInput(SendInput)
    .fields()
    .map((field) =>
      field.name === 'urgency' ? { ...field, choices: URGENCY } : field,
    );

/** Цель черновика: действие экрана 2 на ревизии показа 4. */
const TARGET: DraftJson['target'] = {
  kind: 'action',
  action: 'send',
  revision: 4,
};

/** Черновик номер 3 экрана номер 2. */
const started = () => InputDraft.start(3, 2, TARGET, fields());

/** Черновик одного обязательного поля с вариантами `choices`. */
const picking = (choices: ActionField['choices']) =>
  InputDraft.start(1, 1, TARGET, [
    { name: 'pick', label: 'Выбор', kind: 'choice', optional: false, choices },
  ]);

const names = (draft: InputDraft) => draft.current()?.name;

/** Черновик через JSON — как из снимка в хранилище. */
const viaJson = (draft: InputDraft): InputDraft =>
  InputDraft.of(JSON.parse(JSON.stringify(draft.toJSON())));

describe('InputDraft', () => {
  test('поля по порядку; вход готов один раз — после последнего поля', () => {
    const draft = started();
    const seen: (string | undefined)[] = [];
    const done: boolean[] = [];

    for (const step of [
      () => draft.answer('Хлеб'),
      () => draft.choose(2),
      () => draft.answer('к ужину'),
    ]) {
      seen.push(names(draft));
      step();
      done.push(draft.done());
    }

    expect(seen).toEqual(['title', 'urgency', 'note']);
    expect(done).toEqual([false, false, true]);
    expect(draft.input()).toEqual({
      title: 'Хлеб',
      urgency: 2,
      note: 'к ужину',
    });
  });

  test('вариант — значение Choice.value: и по нажатию, и по подписи текстом', () => {
    const pressed = started();
    pressed.answer('Хлеб');
    pressed.choose(1);
    const typed = started();
    typed.answer('Хлеб');

    const matched = typed.answer('Срочно');
    const unknown = started();
    unknown.answer('Хлеб');

    expect(pressed.input()).toEqual({ title: 'Хлеб', urgency: 1 });
    expect(matched).toBe(true);
    expect(typed.input()).toEqual({ title: 'Хлеб', urgency: 2 });
    expect(unknown.answer('Когда-нибудь')).toBe(false);
    expect(names(unknown)).toBe('urgency');
  });

  test('необязательное поле — «Пропустить»: значения нет; обязательное пропустить нельзя', () => {
    const draft = started();

    expect(() => draft.skip()).toThrow('title');
    draft.answer('Хлеб');
    draft.choose(2);
    draft.skip();

    expect(draft.done()).toBe(true);
    expect(draft.input()).toEqual({ title: 'Хлеб', urgency: 2 });
  });

  test('rejected — повтор поля из issues[0].field, прочие ответы сохранены', () => {
    const draft = started();
    draft.answer('Хлеб');
    draft.choose(2);
    draft.skip();

    const repeated = draft.repeat('title');
    const after = names(draft);
    draft.answer('Молоко');

    expect(repeated).toBe(true);
    expect(after).toBe('title');
    expect(draft.done()).toBe(true);
    expect(draft.input()).toEqual({ title: 'Молоко', urgency: 2 });
  });

  test('замечание по полю вне входа — повтора нет, черновик не меняется', () => {
    const draft = started();
    draft.answer('Хлеб');
    draft.choose(2);
    draft.skip();

    expect(draft.repeat('other')).toBe(false);
    expect(draft.done()).toBe(true);
  });
});

describe('InputDraft — данные черновика', () => {
  test('новый черновик — номер, экран, цель и поля; ответов нет, страница 0', () => {
    const draft = started();

    expect(draft.toJSON()).toEqual({
      serial: 3,
      screen: 2,
      target: TARGET,
      fields: fields(),
      values: {},
      answered: [],
      page: 0,
    });
    expect(names(draft)).toBe('title');
  });

  test('круг JSON черновика посреди шагов — то же текущее поле и ответы', () => {
    const draft = started();
    draft.answer('Хлеб');
    draft.turn(1);

    const json = draft.toJSON();
    const restored = viaJson(draft);
    const current = names(restored);
    restored.choose(2);
    restored.answer('к ужину');

    expect(json).toEqual({
      serial: 3,
      screen: 2,
      target: TARGET,
      fields: fields(),
      values: { title: 'Хлеб' },
      answered: ['title'],
      page: 1,
    });
    // Черновик ложится в снимок беседы: его данные проходят схему снимка.
    expect(
      v.is(ConversationSnapshotSchema, {
        version: 1,
        person: 'person-1',
        serial: 3,
        refs: [],
        seen: [],
        draft: JSON.parse(JSON.stringify(json)),
      }),
    ).toBe(true);
    expect(current).toBe('urgency');
    expect(restored.done()).toBe(true);
    expect(restored.input()).toEqual({
      title: 'Хлеб',
      urgency: 2,
      note: 'к ужину',
    });
  });

  test('черновик из данных снимка: цель локального действия, текущее — первое поле без ответа', () => {
    const draft = InputDraft.of({
      serial: 5,
      screen: 4,
      target: { kind: 'local', local: 'mark', revision: 2 },
      fields: fields(),
      values: { title: 'Хлеб', urgency: 1 },
      answered: ['title', 'urgency'],
      page: 0,
    });

    const current = names(draft);
    draft.answer('к ужину');

    expect(current).toBe('note');
    expect(draft.input()).toEqual({
      title: 'Хлеб',
      urgency: 1,
      note: 'к ужину',
    });
    expect(draft.toJSON()).toMatchObject({
      serial: 5,
      screen: 4,
      target: { kind: 'local', local: 'mark', revision: 2 },
    });
  });
});

describe('InputDraft — выбор номером', () => {
  test('выбор номером: «2» — второй вариант; подпись «2» важнее номера', () => {
    const byNumber = picking([
      { value: 'x', label: 'Первый' },
      { value: 'y', label: 'Второй' },
      { value: 'z', label: 'Третий' },
    ]);
    const byLabel = picking([
      { value: 'x', label: 'Первый' },
      { value: 'y', label: 'Второй' },
      { value: 'z', label: '2' },
    ]);

    const numbered = byNumber.answer('2');
    const labelled = byLabel.answer('2');

    expect(numbered).toBe(true);
    expect(labelled).toBe(true);
    expect(byNumber.input()).toEqual({ pick: 'y' });
    expect(byLabel.input()).toEqual({ pick: 'z' });
  });

  test('номер вне списка — false, поле ждёт', () => {
    const draft = picking([
      { value: 'x', label: 'Первый' },
      { value: 'y', label: 'Второй' },
    ]);

    const zero = draft.answer('0');
    const beyond = draft.answer('3');

    expect(zero).toBe(false);
    expect(beyond).toBe(false);
    expect(names(draft)).toBe('pick');
    expect(draft.input()).toEqual({});
    expect(draft.answer('1')).toBe(true);
    expect(draft.input()).toEqual({ pick: 'x' });
  });

  test('цифры у поля без вариантов — строка как есть', () => {
    const draft = started();

    draft.answer('2');

    expect(draft.input()).toEqual({ title: '2' });
  });
});

describe('InputDraft — страница вариантов', () => {
  test('страница сбрасывается при переходе к следующему полю', () => {
    const draft = started();
    draft.answer('Хлеб');

    draft.turn(2);
    const turned = draft.toJSON().page;
    draft.choose(1);

    expect(turned).toBe(2);
    expect(draft.toJSON().page).toBe(0);
    expect(names(draft)).toBe('note');
  });
});

// Приведение ответа к виду поля (`FieldInput`, D-UI-47): число из текста —
// числом, остальное строкой; булево — неявные варианты «Да» и «Нет».

const TypedInput = v.object({
  count: v.pipe(v.number('Введите число'), v.title('Количество')),
  flag: v.pipe(v.boolean(), v.title('Срочно')),
  mark: v.optional(v.pipe(v.number('Введите число'), v.title('Оценка'))),
  when: v.pipe(v.string(), v.isoDate(), v.title('Дата')),
});

const typed = () =>
  InputDraft.start(1, 1, TARGET, new ActionInput(TypedInput).fields());

/** Черновик одного числового поля. */
const counting = () =>
  InputDraft.start(
    1,
    1,
    TARGET,
    new ActionInput(TypedInput).fields().filter((f) => f.name === 'count'),
  );

describe('InputDraft — приведение ответа к виду поля', () => {
  test('число: «3» ложится в вход числом', () => {
    const draft = counting();

    const accepted = draft.answer('3');

    expect(accepted).toBe(true);
    expect(draft.input()).toEqual({ count: 3 });
    expect(draft.done()).toBe(true);
  });

  test('число, пропуск необязательного: значения нет, поле отвечено', () => {
    const draft = InputDraft.start(
      1,
      1,
      TARGET,
      new ActionInput(TypedInput).fields().filter((f) => f.name === 'mark'),
    );

    draft.skip();

    expect(draft.input()).toEqual({});
    expect(draft.done()).toBe(true);
  });

  test('число с вариантами кода экрана: «2» — второй вариант по номеру, не число 2', () => {
    const draft = InputDraft.start(1, 1, TARGET, [
      {
        name: 'level',
        label: 'Уровень',
        kind: 'choice',
        optional: false,
        choices: [
          { value: 10, label: 'Низкий' },
          { value: 20, label: 'Высокий' },
        ],
      },
    ]);

    draft.answer('2');

    expect(draft.input()).toEqual({ level: 20 });
  });

  test('число с вариантами: подпись, совпавшая с текстом числа, выбирает вариант', () => {
    const draft = InputDraft.start(1, 1, TARGET, [
      {
        name: 'level',
        label: 'Уровень',
        kind: 'number',
        optional: false,
        choices: [
          { value: 100, label: '5' },
          { value: 200, label: '6' },
        ],
      },
    ]);

    draft.answer('6');

    expect(draft.input()).toEqual({ level: 200 });
  });

  test('булево: поле — неявные «Да» и «Нет», ответ подписью даёт true и false', () => {
    const asked = (text: string) => {
      const draft = InputDraft.start(
        1,
        1,
        TARGET,
        new ActionInput(TypedInput).fields().filter((f) => f.name === 'flag'),
      );
      draft.answer(text);
      return draft.input();
    };

    expect([asked('Да'), asked('Нет')]).toEqual([
      { flag: true },
      { flag: false },
    ]);
  });

  test('булево: номер «2» — «Нет» (false), а не число 2 и не строка', () => {
    const draft = InputDraft.start(
      1,
      1,
      TARGET,
      new ActionInput(TypedInput).fields().filter((f) => f.name === 'flag'),
    );

    draft.answer('2');

    expect(draft.input()).toEqual({ flag: false });
  });

  test('булево: нажатие «Нет» (false) — отвечено, значение false в входе', () => {
    const draft = InputDraft.start(
      1,
      1,
      TARGET,
      new ActionInput(TypedInput).fields().filter((f) => f.name === 'flag'),
    );

    draft.choose(false);

    expect(draft.done()).toBe(true);
    expect(draft.input()).toEqual({ flag: false });
  });

  test('булево: текст не из вариантов — не принят, поле остаётся текущим', () => {
    const draft = InputDraft.start(
      1,
      1,
      TARGET,
      new ActionInput(TypedInput).fields().filter((f) => f.name === 'flag'),
    );

    const accepted = draft.answer('может быть');

    expect(accepted).toBe(false);
    expect(draft.current()?.name).toBe('flag');
  });

  test('шаги черновика разных видов по порядку: число, булево, дата; значения — через JSON снимка без потери типа', () => {
    const draft = typed();

    draft.answer('4');
    draft.answer('Нет');
    draft.skip();
    draft.answer('2026-01-02');
    const restored = viaJson(draft);

    expect(restored.done()).toBe(true);
    expect(restored.input()).toEqual({
      count: 4,
      flag: false,
      when: '2026-01-02',
    });
  });
});
