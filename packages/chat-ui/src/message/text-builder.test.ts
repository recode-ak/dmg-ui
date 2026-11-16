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
