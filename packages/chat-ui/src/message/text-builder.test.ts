import { describe, expect, test } from 'bun:test';
import { TextBuilder } from './text-builder';

// Форматированный текст — плоские фрагменты со стилями и ссылкой. Построитель
// держит инварианты формы: пустое пропускается, соседи с теми же стилями и
// ссылкой склеиваются, стили — в порядке `TEXT_STYLES` без повторов, цитата и
// блок кода занимают целые строки, разметки и экранирования нет.

const HELP = 'https://example.org/help';
const OTHER = 'https://example.org/other';

describe('TextBuilder', () => {
  test('of — один фрагмент без стилей и без ссылки', () => {
    expect(TextBuilder.of('Купить хлеб')).toEqual([
      { text: 'Купить хлеб', styles: [] },
    ]);
  });

  test('of пустой строки — пустой текст', () => {
    expect(TextBuilder.of('')).toEqual([]);
  });

  test('построенный текст — JSON: круг через JSON его не меняет, у фрагмента без ссылки нет ключа link', () => {
    const text = new TextBuilder()
      .text('Итог: ')
      .bold('хлеб')
      .link('справка', HELP)
      .build();

    expect(JSON.parse(JSON.stringify(text))).toStrictEqual(text);
    expect('link' in text[0]!).toBe(false);
  });

  test('соседние фрагменты с теми же стилями склеиваются', () => {
    expect(new TextBuilder().text('Купить ').text('хлеб').build()).toEqual([
      { text: 'Купить хлеб', styles: [] },
    ]);
    expect(new TextBuilder().bold('раз').bold(' два').build()).toEqual([
      { text: 'раз два', styles: ['bold'] },
    ]);
    expect(
      new TextBuilder()
        .bold((b) => b.text('раз'))
        .bold(' два')
        .build(),
    ).toEqual([{ text: 'раз два', styles: ['bold'] }]);
  });

  test('фрагменты с разными стилями не склеиваются', () => {
    expect(
      new TextBuilder().text('Купить ').bold('хлеб').text(' и молоко').build(),
    ).toEqual([
      { text: 'Купить ', styles: [] },
      { text: 'хлеб', styles: ['bold'] },
      { text: ' и молоко', styles: [] },
    ]);
  });

  test('соседние ссылки склеиваются только с тем же адресом; текст со ссылкой не склеивается', () => {
    expect(
      new TextBuilder()
        .text('см. ')
        .link('раз', HELP)
        .link('два', HELP)
        .link('три', OTHER)
        .build(),
    ).toEqual([
      { text: 'см. ', styles: [] },
      { text: 'раздва', styles: [], link: HELP },
      { text: 'три', styles: [], link: OTHER },
    ]);
  });

  test('стили — в каноническом порядке и без повторов', () => {
    expect(
      new TextBuilder().strike((s) => s.italic((i) => i.bold('x'))).build(),
    ).toEqual([{ text: 'x', styles: ['bold', 'italic', 'strike'] }]);
    expect(new TextBuilder().bold((b) => b.bold('x')).build()).toEqual([
      { text: 'x', styles: ['bold'] },
    ]);
    expect(
      new TextBuilder().quote((q) => q.italic((i) => i.bold('x'))).build(),
    ).toEqual([{ text: 'x', styles: ['bold', 'italic', 'quote'] }]);
  });

  test('вложенный построитель накладывает стиль на все свои фрагменты', () => {
    expect(
      new TextBuilder()
        .bold((b) =>
          b.text('купить ').italic('свежий').text(' ').link('хлеб', HELP),
        )
        .build(),
    ).toEqual([
      { text: 'купить ', styles: ['bold'] },
      { text: 'свежий', styles: ['bold', 'italic'] },
      { text: ' ', styles: ['bold'] },
      { text: 'хлеб', styles: ['bold'], link: HELP },
    ]);
  });

  test('жирная ссылка — ссылка внутри жирного: адрес прежний, стиль жирный', () => {
    expect(
      new TextBuilder().bold((b) => b.link('справка', HELP)).build(),
    ).toEqual([{ text: 'справка', styles: ['bold'], link: HELP }]);
  });

  test('строчный код не получает внешних строчных стилей', () => {
    expect(
      new TextBuilder().bold((b) => b.text('запусти ').code('x = 1')).build(),
    ).toEqual([
      { text: 'запусти ', styles: ['bold'] },
      { text: 'x = 1', styles: ['code'] },
    ]);
    expect(
      new TextBuilder().italic((i) => i.strike((s) => s.code('y'))).build(),
    ).toEqual([{ text: 'y', styles: ['code'] }]);
  });

  test('строчный код в цитате — стили code и quote, внешний жирный не действует', () => {
    expect(
      new TextBuilder()
        .quote((q) => q.text('пример: ').bold((b) => b.code('x')))
        .build(),
    ).toEqual([
      { text: 'пример: ', styles: ['quote'] },
      { text: 'x', styles: ['code', 'quote'] },
    ]);
  });

  test('цитата занимает целые строки: текст до и после неё — с новой строки', () => {
    expect(
      new TextBuilder().text('До').quote('цитата').text('после').build(),
    ).toEqual([
      { text: 'До\n', styles: [] },
      { text: 'цитата', styles: ['quote'] },
      { text: '\nпосле', styles: [] },
    ]);
  });

  test('блок кода занимает целые строки; перевод строки после блока — без стилей', () => {
    expect(
      new TextBuilder().text('Пример:').codeBlock('x = 1').bold('итог').build(),
    ).toEqual([
      { text: 'Пример:\n', styles: [] },
      { text: 'x = 1', styles: ['codeBlock'] },
      { text: '\n', styles: [] },
      { text: 'итог', styles: ['bold'] },
    ]);
  });

  test('блок кода не берёт других стилей, даже внутри жирного', () => {
    expect(new TextBuilder().bold((b) => b.codeBlock('x = 1')).build()).toEqual(
      [{ text: 'x = 1', styles: ['codeBlock'] }],
    );
  });

  test('перевод строки у блока ставится только при нужде', () => {
    expect(new TextBuilder().quote('ц').text('после').build()).toEqual([
      { text: 'ц', styles: ['quote'] },
      { text: '\nпосле', styles: [] },
    ]);
    expect(new TextBuilder().text('До').quote('ц').build()).toEqual([
      { text: 'До\n', styles: [] },
      { text: 'ц', styles: ['quote'] },
    ]);
    expect(new TextBuilder().text('До\n').codeBlock('x').build()).toEqual([
      { text: 'До\n', styles: [] },
      { text: 'x', styles: ['codeBlock'] },
    ]);
    expect(
      new TextBuilder()
        .text('До')
        .line()
        .quote('ц')
        .line()
        .text('после')
        .build(),
    ).toEqual([
      { text: 'До\n', styles: [] },
      { text: 'ц', styles: ['quote'] },
      { text: '\nпосле', styles: [] },
    ]);
    expect(
      new TextBuilder().quote('ц').paragraph().text('после').build(),
    ).toEqual([
      { text: 'ц', styles: ['quote'] },
      { text: '\n\nпосле', styles: [] },
    ]);
  });

  test('вложенная цитата: стиль цитаты на всех фрагментах, строки целые', () => {
    expect(
      new TextBuilder()
        .text('Он сказал:')
        .quote((q) => q.text('купи ').bold('хлеб'))
        .text('Хорошо.')
        .build(),
    ).toEqual([
      { text: 'Он сказал:\n', styles: [] },
      { text: 'купи ', styles: ['quote'] },
      { text: 'хлеб', styles: ['bold', 'quote'] },
      { text: '\nХорошо.', styles: [] },
    ]);
  });

  test('line и paragraph — переводы строк без стилей внутри текста', () => {
    expect(
      new TextBuilder()
        .text('а')
        .line()
        .text('б')
        .paragraph()
        .text('в')
        .build(),
    ).toEqual([{ text: 'а\nб\n\nв', styles: [] }]);
    expect(new TextBuilder().bold('а').line().bold('б').build()).toEqual([
      { text: 'а', styles: ['bold'] },
      { text: '\n', styles: [] },
      { text: 'б', styles: ['bold'] },
    ]);
  });

  test('пустые строки пропускаются; пустая цитата не ставит переводов строки', () => {
    expect(
      new TextBuilder()
        .text('')
        .bold('')
        .italic((i) => i)
        .strike('')
        .link('', HELP)
        .code('')
        .codeBlock('')
        .text('хлеб')
        .build(),
    ).toEqual([{ text: 'хлеб', styles: [] }]);
    expect(new TextBuilder().text('а').quote('').text('б').build()).toEqual([
      { text: 'аб', styles: [] },
    ]);
  });

  test('пустой построитель даёт пустой текст', () => {
    expect(new TextBuilder().build()).toEqual([]);
  });

  test('строка собеседника с *_< остаётся текстом — без экранирования', () => {
    const raw = '2*3 = 6_ <b>x</b> `y` [z](w) \\';

    expect(new TextBuilder().text(raw).build()).toEqual([
      { text: raw, styles: [] },
    ]);
    expect(new TextBuilder().bold(raw).build()).toEqual([
      { text: raw, styles: ['bold'] },
    ]);
    expect(new TextBuilder().link(raw, HELP).build()).toEqual([
      { text: raw, styles: [], link: HELP },
    ]);
  });
});

// Момент времени: фрагмент несёт `moment { at, show }`, `text` —
// запасной текст. `at` — секунды Unix: целое, не меньше 0, безопасное.

const AT = 1_800_000_000;

describe('TextBuilder.moment', () => {
  test('момент — отдельный фрагмент с `text` как запасным текстом', () => {
    expect(
      new TextBuilder()
        .text('Срок: ')
        .moment('18 ноября', AT, 'date')
        .text('.')
        .build(),
    ).toEqual([
      { text: 'Срок: ', styles: [] },
      { text: '18 ноября', styles: [], moment: { at: AT, show: 'date' } },
      { text: '.', styles: [] },
    ]);
  });

  test.each(['date', 'time', 'dateTime', 'relative'] as const)(
    'вид показа %s принимается и сохраняется',
    (show) => {
      expect(new TextBuilder().moment('сегодня', 0, show).build()).toEqual([
        { text: 'сегодня', styles: [], moment: { at: 0, show } },
      ]);
    },
  );

  test('момент не склеивается с соседним обычным текстом и с другим моментом', () => {
    const built = new TextBuilder()
      .text('а')
      .moment('б', AT, 'time')
      .text('в')
      .build();

    expect(built).toHaveLength(3);
    expect(
      new TextBuilder()
        .moment('а', AT, 'date')
        .moment('б', AT + 60, 'date')
        .build(),
    ).toHaveLength(2);
  });

  test('момент внутри bold и quote сохраняется вместе со стилем', () => {
    expect(
      new TextBuilder().bold((b) => b.moment('18:00', AT, 'time')).build(),
    ).toEqual([
      { text: '18:00', styles: ['bold'], moment: { at: AT, show: 'time' } },
    ]);
    expect(
      new TextBuilder().quote((b) => b.moment('18:00', AT, 'time')).build(),
    ).toEqual([
      { text: '18:00', styles: ['quote'], moment: { at: AT, show: 'time' } },
    ]);
  });

  test('построенный момент — JSON: круг через JSON его не меняет', () => {
    const built = new TextBuilder().moment('18:00', AT, 'dateTime').build();

    expect(JSON.parse(JSON.stringify(built))).toStrictEqual(built);
  });

  test('пустой запасной текст пропускается, как и прочий пустой текст', () => {
    expect(new TextBuilder().moment('', AT, 'date').build()).toEqual([]);
  });

  test.each([
    ['дробное at', 1.5],
    ['отрицательное at', -1],
    ['at больше безопасного целого', Number.MAX_SAFE_INTEGER + 1],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('%s — бросок построителя', (_, at) => {
    expect(() => new TextBuilder().moment('х', at, 'date')).toThrow();
  });

  test('вид показа вне перечня — бросок построителя', () => {
    expect(() =>
      new TextBuilder().moment('х', AT, 'weekday' as never),
    ).toThrow();
  });

  test('граничные at — 0 и наибольшее безопасное целое — принимаются', () => {
    expect(() => new TextBuilder().moment('х', 0, 'date')).not.toThrow();
    expect(() =>
      new TextBuilder().moment('х', Number.MAX_SAFE_INTEGER, 'date'),
    ).not.toThrow();
  });
});
