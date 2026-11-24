import { describe, expect, test } from 'bun:test';
import type { ActionField, InstanceView } from 'dmg-ui';
import { LIST_ID } from 'dmg-ui/testing';
import { examplePagesViews } from '../../testing';
import { PageRenderer } from './page-renderer';

// Строка поля формы в тексте страницы: подпись, необязательность, вид ввода
// и после него — подсказка, «Пример: …» и «Пределы: …» (`FieldInput.limitsText`)
// через «; » после тире; пустые части опускаются. Вид — собранный вручную,
// без исполнителя: проверяется только рендер.

const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};

/** Вид списка с одним доступным действием `jumpTo` и заданными полями. */
const viewOf = (fields: readonly ActionField[]): InstanceView => ({
  screen: LIST_ID,
  address: { screen: LIST_ID, params: { page: 0 } },
  revision: 1,
  status: 'ready',
  data: { tasks: [] },
  state: { selected: [] },
  context: CONTEXT,
  actions: [{ name: 'jumpTo', availability: { kind: 'available' }, fields }],
  locals: [],
});

const renderer = new PageRenderer(examplePagesViews());

/** Строки поля в тексте вида — между заголовком формы и её кнопкой. */
const fieldLines = (fields: readonly ActionField[]): string[] =>
  renderer
    .screen(viewOf(fields))
    .split('\n')
    .filter((line) => line.startsWith('  ') && !line.startsWith('  ['));

const PART: ActionField = {
  name: 'part',
  label: 'Часть',
  kind: 'number',
  optional: false,
  hint: 'Номер части списка, с первой',
  example: 2,
  limits: { min: 1, max: 99, integer: true },
};

describe('PageRenderer — подсказка, пример и пределы поля', () => {
  test('все части: подпись, пустой ввод, затем подсказка, пример и пределы одной строкой', () => {
    expect(fieldLines([PART])).toEqual([
      '  Часть: ____ — Номер части списка, с первой; Пример: 2; Пределы: от 1 до 99, целое',
    ]);
  });

  test('только подсказка: без примера и пределов', () => {
    const { example: _e, limits: _l, ...rest } = PART;

    expect(fieldLines([rest])).toEqual([
      '  Часть: ____ — Номер части списка, с первой',
    ]);
  });

  test('только пример и только пределы — каждый сам по себе', () => {
    const { hint: _h, limits: _l, ...exampleOnly } = PART;
    const { hint: _h2, example: _e, ...limitsOnly } = PART;

    expect(fieldLines([exampleOnly])).toEqual(['  Часть: ____ — Пример: 2']);
    expect(fieldLines([limitsOnly])).toEqual([
      '  Часть: ____ — Пределы: от 1 до 99, целое',
    ]);
  });

  test('пример-строка показывается как есть', () => {
    const { hint: _h, limits: _l, ...rest } = PART;
    const text: ActionField = {
      ...rest,
      kind: 'string',
      example: 'Купить хлеб',
    };

    expect(fieldLines([text])).toEqual(['  Часть: ____ — Пример: Купить хлеб']);
  });

  test('ничего из трёх — строка прежняя, без тире', () => {
    expect(
      fieldLines([
        { name: 'part', label: 'Часть', kind: 'number', optional: false },
      ]),
    ).toEqual(['  Часть: ____']);
  });

  test('необязательное поле: пометка стоит до двоеточия, подсказка — после ввода', () => {
    expect(fieldLines([{ ...PART, optional: true }])).toEqual([
      '  Часть (необязательно): ____ — Номер части списка, с первой; Пример: 2; Пределы: от 1 до 99, целое',
    ]);
  });

  test('поле с вариантами: варианты через « | », подсказка после них', () => {
    const choice: ActionField = {
      name: 'level',
      label: 'Уровень',
      kind: 'choice',
      optional: false,
      hint: 'Насколько важно',
      choices: [
        { value: 'low', label: 'Низкий' },
        { value: 'high', label: 'Высокий' },
      ],
    };

    expect(fieldLines([choice])).toEqual([
      '  Уровень: Низкий | Высокий — Насколько важно',
    ]);
  });
});
