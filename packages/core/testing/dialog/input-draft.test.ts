import { describe, expect, test } from 'bun:test';
import { type ActionField, ActionInput } from 'dmg-ui';
import * as v from 'valibot';
import { InputDraft } from './input-draft';

// Вход действия по шагам (Т-4): поля из `ActionView.fields` по порядку,
// текст — строка, вариант — `Choice.value`, необязательное поле можно
// пропустить; вход готов один раз — после последнего поля. Поля — локального
// входа с тремя полями: на учебном примере столько полей у действия нет.

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

const names = (draft: InputDraft) => draft.current()?.name;

describe('InputDraft', () => {
  test('поля по порядку; вход готов один раз — после последнего поля', () => {
    const draft = new InputDraft(fields());
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
    const pressed = new InputDraft(fields());
    pressed.answer('Хлеб');
    pressed.choose(1);
    const typed = new InputDraft(fields());
    typed.answer('Хлеб');

    const matched = typed.answer('Срочно');
    const unknown = new InputDraft(fields());
    unknown.answer('Хлеб');

    expect(pressed.input()).toEqual({ title: 'Хлеб', urgency: 1 });
    expect(matched).toBe(true);
    expect(typed.input()).toEqual({ title: 'Хлеб', urgency: 2 });
    expect(unknown.answer('Когда-нибудь')).toBe(false);
    expect(names(unknown)).toBe('urgency');
  });

  test('необязательное поле — «Пропустить»: значения нет; обязательное пропустить нельзя', () => {
    const draft = new InputDraft(fields());

    expect(() => draft.skip()).toThrow('title');
    draft.answer('Хлеб');
    draft.choose(2);
    draft.skip();

    expect(draft.done()).toBe(true);
    expect(draft.input()).toEqual({ title: 'Хлеб', urgency: 2 });
  });

  test('rejected — повтор поля из issues[0].field, прочие ответы сохранены', () => {
    const draft = new InputDraft(fields());
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
    const draft = new InputDraft(fields());
    draft.answer('Хлеб');
    draft.choose(2);
    draft.skip();

    expect(draft.repeat('other')).toBe(false);
    expect(draft.done()).toBe(true);
  });
});
