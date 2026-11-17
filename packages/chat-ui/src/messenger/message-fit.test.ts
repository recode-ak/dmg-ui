import { describe, expect, test } from 'bun:test';
import type { LengthUnit, TextLimit } from '../limit/limit.types';
import { TextLength } from '../limit/text-length';
import type { Message, MessageOption } from '../message/message.types';
import { TextBuilder } from '../message/text-builder';
import { MessageFit } from './message-fit';
import type { MessengerCapabilities } from './messenger.types';

// Подгонка сообщения под возможности мессенджера — по тесту на каждый вид
// лимита. Порядок: лишние варианты отбрасываются с хвоста, ссылка сверх
// лимита — бросок, затем подписи, затем текст (`textWithOptions`, если
// варианты есть, иначе `text`). Уложилось — тот же объект и разрезов нет.

const THUMB_TONE = '\u{1F44D}\u{1F3FD}';

const CAPABILITIES: MessengerCapabilities = {
  name: 'проба',
  kinds: ['text'],
  edit: true,
  text: { max: 4096, unit: 'codePoint' },
  textWithOptions: { max: 1024, unit: 'codePoint' },
  options: { max: 3, label: { max: 20, unit: 'grapheme' }, ref: 8 },
  pressAnswer: { max: 200, unit: 'utf16' },
  form: false,
  initiative: { kind: 'always' },
  community: { signals: [], operations: [] },
};

const fit = (capabilities: MessengerCapabilities = CAPABILITIES) =>
  new MessageFit(capabilities);

const message = (
  text: string,
  options: readonly MessageOption[] = [],
): Message => ({ kind: 'text', text: TextBuilder.of(text), options });

const option = (n: number, label = `Вариант ${n}`): MessageOption => ({
  ref: `r${n}`,
  label,
});

describe('MessageFit.message', () => {
  test('уложилось — тот же объект и разрезов нет', () => {
    const fitting = message('Купить хлеб', [option(1), option(2), option(3)]);

    const fitted = fit().message(fitting);

    expect(fitted.value).toBe(fitting);
    expect(fitted.cuts).toEqual([]);
  });

  test('ровно на пределах — тот же объект', () => {
    const edge = message('a'.repeat(1024), [
      { ref: 'abcdefgh', label: 'б'.repeat(20) },
      option(2),
      option(3),
    ]);
    const plain = message('a'.repeat(4096));

    expect(fit().message(edge).value).toBe(edge);
    expect(fit().message(plain).value).toBe(plain);
  });

  test('лимит текста без вариантов', () => {
    const long = message('a'.repeat(4097));

    const fitted = fit().message(long);

    expect(fitted.value).toEqual({
      kind: 'text',
      text: [{ text: `${'a'.repeat(4095)}…`, styles: [] }],
      options: [],
    });
    expect(fitted.cuts).toStrictEqual([
      { limit: 'text', max: 4096, unit: 'codePoint', length: 4097 },
    ]);
  });

  test('лимит текста с вариантами: 1024 при 4096 без вариантов', () => {
    const text = 'a'.repeat(2000);
    const withOptions = message(text, [option(1)]);
    const withoutOptions = message(text);

    const fitted = fit().message(withOptions);

    expect(fitted.value).toEqual({
      kind: 'text',
      text: [{ text: `${'a'.repeat(1023)}…`, styles: [] }],
      options: [option(1)],
    });
    expect(fitted.cuts).toStrictEqual([
      { limit: 'textWithOptions', max: 1024, unit: 'codePoint', length: 2000 },
    ]);
    expect(fit().message(withoutOptions).value).toBe(withoutOptions);
  });

  test('лимит числа вариантов: хвост отброшен', () => {
    const many = message(
      'Выбери',
      [1, 2, 3, 4, 5].map((n) => option(n)),
    );

    const fitted = fit().message(many);

    expect(fitted.value).toEqual(
      message('Выбери', [option(1), option(2), option(3)]),
    );
    expect(fitted.cuts).toStrictEqual([
      { limit: 'options', max: 3, length: 5 },
    ]);
  });

  test('лимит подписи: обрезана только длинная, index в cut', () => {
    const longLabel = 'д'.repeat(21);
    const source = message('Выбери', [option(1), option(2, longLabel)]);
    const before = structuredClone(source);

    const fitted = fit().message(source);

    expect(fitted.value).toEqual(
      message('Выбери', [option(1), option(2, `${'д'.repeat(19)}…`)]),
    );
    expect(fitted.cuts).toStrictEqual([
      { limit: 'label', max: 20, unit: 'grapheme', length: 21, index: 1 },
    ]);
    expect(source).toEqual(before);
  });

  test('лимит короткой ссылки: бросок', () => {
    const tooLong = message('Выбери', [{ ref: 'abcdefghi', label: 'Да' }]);

    expect(() => fit().message(tooLong)).toThrow();
  });

  test('ссылка отброшенного с хвоста варианта не проверяется', () => {
    const source = message('Выбери', [
      option(1),
      option(2),
      option(3),
      { ref: 'abcdefghi', label: 'Лишний' },
    ]);

    expect(fit().message(source).value.options).toEqual([
      option(1),
      option(2),
      option(3),
    ]);
  });

  test('разрезы идут по порядку: варианты, подписи, текст', () => {
    const source = message('a'.repeat(1100), [
      option(1),
      option(2, 'д'.repeat(25)),
      option(3),
      option(4),
    ]);

    const fitted = fit().message(source);

    expect(fitted.cuts).toStrictEqual([
      { limit: 'options', max: 3, length: 4 },
      { limit: 'label', max: 20, unit: 'grapheme', length: 25, index: 1 },
      { limit: 'textWithOptions', max: 1024, unit: 'codePoint', length: 1100 },
    ]);
    expect(new TextLength('codePoint').of(fitted.value.text)).toBe(1024);
  });

  test('одно сообщение с эмодзи по-разному укладывается в grapheme и в utf16', () => {
    const textLimit = (unit: LengthUnit): MessengerCapabilities => {
      const limit: TextLimit = { max: 5, unit };
      return { ...CAPABILITIES, text: limit };
    };
    const thumbs = message(THUMB_TONE.repeat(5));

    const byGrapheme = fit(textLimit('grapheme')).message(thumbs);
    const byUtf16 = fit(textLimit('utf16')).message(thumbs);

    expect(byGrapheme.value).toBe(thumbs);
    expect(byGrapheme.cuts).toEqual([]);
    expect(byUtf16.value.text).toEqual([
      { text: `${THUMB_TONE}…`, styles: [] },
    ]);
    expect(byUtf16.cuts).toStrictEqual([
      { limit: 'text', max: 5, unit: 'utf16', length: 20 },
    ]);
  });
});

describe('MessageFit — акцент и момент', () => {
  test('обрезка текста: целый фрагмент с моментом сохраняет его, оборванный теряет', () => {
    const whole = {
      text: 'завтра',
      styles: [],
      moment: { at: 1_800_000_000, show: 'date' },
    } as const;
    const torn = {
      text: 'б'.repeat(5000),
      styles: [],
      moment: { at: 1_800_000_000, show: 'dateTime' },
    } as const;
    const long: Message = {
      kind: 'text',
      text: [whole, { text: ' ', styles: [] }, torn],
      options: [],
    };

    const fitted = fit().message(long);

    expect(fitted.cuts).toHaveLength(1);
    const [first, , last] = (fitted.value as Message).text;
    expect(first).toEqual(whole);
    expect(last?.moment).toBeUndefined();
    expect(last?.text.endsWith('…')).toBe(true);
  });

  test('уложившийся текст с моментом — тот же объект', () => {
    const fitting: Message = {
      kind: 'text',
      text: [
        {
          text: 'завтра',
          styles: [],
          moment: { at: 1_800_000_000, show: 'relative' },
        },
      ],
      options: [],
    };

    expect(fit().message(fitting).value).toBe(fitting);
  });

  test('обрезка подписи сохраняет акцент варианта', () => {
    const source = message('Выбери', [
      { ref: 'r1', label: 'д'.repeat(21), accent: 'danger' },
      { ref: 'r2', label: 'Да', accent: 'positive' },
      option(3),
    ]);

    const fitted = fit().message(source);

    expect((fitted.value as Message).options).toEqual([
      { ref: 'r1', label: `${'д'.repeat(19)}…`, accent: 'danger' },
      { ref: 'r2', label: 'Да', accent: 'positive' },
      option(3),
    ]);
  });

  test('лишние варианты с хвоста отброшены, у оставленных акцент цел', () => {
    const source = message('Выбери', [
      { ref: 'r1', label: 'А', accent: 'primary' },
      option(2),
      option(3),
      { ref: 'r4', label: 'Лишний', accent: 'danger' },
    ]);

    const kept = (fit().message(source).value as Message).options;

    expect(kept[0]).toEqual({ ref: 'r1', label: 'А', accent: 'primary' });
    expect(kept).toHaveLength(3);
  });
});

describe('MessageFit.answer', () => {
  test('лимит ответа на нажатие', () => {
    const fitted = fit().answer('a'.repeat(201));

    expect(fitted.value).toBe(`${'a'.repeat(199)}…`);
    expect(fitted.cuts).toStrictEqual([
      { limit: 'pressAnswer', max: 200, unit: 'utf16', length: 201 },
    ]);
  });

  test('уложился — та же строка и разрезов нет', () => {
    const fitted = fit().answer('a'.repeat(200));

    expect(fitted.value).toBe('a'.repeat(200));
    expect(fitted.cuts).toEqual([]);
  });

  test('ответа на нажатие нет в возможностях — строка как есть', () => {
    const { pressAnswer, ...withoutAnswer } = CAPABILITIES;

    const fitted = fit(withoutAnswer).answer('a'.repeat(500));

    expect(fitted.value).toBe('a'.repeat(500));
    expect(fitted.cuts).toEqual([]);
  });
});
