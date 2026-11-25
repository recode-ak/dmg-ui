import { describe, expect, test } from 'bun:test';
import type { FieldKind } from 'dmg-ui';
import type { PageForm, PageFormField, PageFormSet } from 'dmg-ui/web-ui';
import { RegionControls } from './region-controls';
import type { ActionModel, FieldModel, FormModel } from './region-model.types';

// Вид действий и полей, который решает модель, а не DOM: причина отключённого,
// виджет поля по `kind` и вариантам, пределы числа, строка подсказки. Входы —
// литералы `PageFormSet`: клиент и сервер не нужны.

const controls = new RegionControls(['open']);

const field = (over: Partial<PageFormField> = {}): PageFormField => ({
  name: 'value',
  label: 'Значение',
  optional: false,
  kind: 'string',
  value: '',
  issues: [],
  ...over,
});

const form = (over: Partial<PageForm> = {}): PageForm => ({
  kind: 'action',
  name: 'act',
  label: 'Действие',
  description: 'Описание.',
  primary: false,
  available: true,
  fields: [],
  issues: [],
  ...over,
});

const setOf = (...forms: PageForm[]): PageFormSet => ({
  forms,
  general: [],
});

/** Единственная форма набора из одной формы с полями. */
const formOf = (over: Partial<PageForm> = {}): FormModel => {
  const found = controls.of(setOf(form(over))).forms[0];
  if (found === undefined) throw new Error('форма не построена');
  return found;
};

/** Модель единственного поля `input`. */
const modelOf = (input: Partial<PageFormField>): FieldModel => {
  const found = formOf({ fields: [field(input)] }).fields[0];
  if (found === undefined) throw new Error('поле не построено');
  return found;
};

const actionOf = (over: Partial<PageForm> = {}): ActionModel => {
  const found = controls.of(setOf(form(over))).actions[0];
  if (found === undefined) throw new Error('действие не построено');
  return found;
};

const YES_NO = ['Да', 'Нет'];

describe('RegionControls — причина отключённого', () => {
  test('действие без полей: недоступное с причиной — enabled false и тот же reason', () => {
    const action = actionOf({
      available: false,
      reason: 'Отметьте открытые задачи',
    });

    expect(action.enabled).toBe(false);
    expect(action.reason).toBe('Отметьте открытые задачи');
  });

  test('форма с полями: недоступная с причиной — enabled false и тот же reason', () => {
    const model = formOf({
      available: false,
      reason: 'Слишком много открытых задач',
      fields: [field()],
    });

    expect(model.enabled).toBe(false);
    expect(model.reason).toBe('Слишком много открытых задач');
  });

  test('доступное действие и доступная форма — ключа reason нет', () => {
    expect(actionOf()).not.toHaveProperty('reason');
    expect(formOf({ fields: [field()] })).not.toHaveProperty('reason');
  });

  test('недоступное без причины (пауза) — enabled false и ключа reason нет', () => {
    const action = actionOf({ available: false });
    const model = formOf({ available: false, fields: [field()] });

    expect(action.enabled).toBe(false);
    expect(action).not.toHaveProperty('reason');
    expect(model.enabled).toBe(false);
    expect(model).not.toHaveProperty('reason');
  });
});

describe('RegionControls — виджет поля', () => {
  const table: [string, Partial<PageFormField>, FieldModel['widget']][] = [
    [
      'boolean, два варианта, обязательное — checkbox',
      { kind: 'boolean', choices: YES_NO },
      'checkbox',
    ],
    [
      'boolean, два варианта, необязательное — choice',
      { kind: 'boolean', choices: YES_NO, optional: true },
      'choice',
    ],
    [
      'boolean, три варианта — choice',
      { kind: 'boolean', choices: ['Да', 'Нет', 'Позже'] },
      'choice',
    ],
    [
      'boolean, один вариант — choice',
      { kind: 'boolean', choices: ['Да'] },
      'choice',
    ],
    [
      'number с вариантами — choice: варианты побеждают',
      { kind: 'number', choices: ['1', '2'] },
      'choice',
    ],
    [
      'string с вариантами — choice',
      { kind: 'string', choices: ['low', 'high'] },
      'choice',
    ],
    [
      'date с вариантами — choice',
      { kind: 'date', choices: ['2026-01-01'] },
      'choice',
    ],
    ['choice без вариантов — text', { kind: 'choice' }, 'text'],
    [
      'имя assigneeId без вариантов — person',
      { name: 'assigneeId', kind: 'string' },
      'person',
    ],
    [
      'имя assigneeId побеждает kind number — person',
      { name: 'assigneeId', kind: 'number' },
      'person',
    ],
    ['number без вариантов — number', { kind: 'number' }, 'number'],
    ['date без вариантов — date', { kind: 'date' }, 'date'],
    ['string без вариантов — text', { kind: 'string' }, 'text'],
    ['boolean без вариантов — text', { kind: 'boolean' }, 'text'],
  ];

  test.each(table)('%s', (_, input, widget) => {
    expect(modelOf(input).widget).toBe(widget);
  });

  test('общие поля сохраняются: имя, подпись, значение, необязательность, замечания', () => {
    const model = modelOf({
      name: 'when',
      label: 'Когда',
      kind: 'date',
      value: '2026-12-31',
      issues: ['Дата в виде ГГГГ-ММ-ДД'],
    });

    expect(model).toMatchObject({
      name: 'when',
      label: 'Когда',
      value: '2026-12-31',
      optional: false,
      issues: ['Дата в виде ГГГГ-ММ-ДД'],
    });
  });

  test('у choice подписи вариантов уходят в choices; у остальных виджетов поля choices нет', () => {
    expect(modelOf({ choices: ['low', 'high'] }).choices).toEqual([
      'low',
      'high',
    ]);
    expect(modelOf({ kind: 'number' })).not.toHaveProperty('choices');
    expect(modelOf({ kind: 'date' })).not.toHaveProperty('choices');
  });
});

describe('RegionControls — чекбокс', () => {
  const boolean = (value: string) =>
    modelOf({ kind: 'boolean', choices: YES_NO, value });

  test('значение «Да» — checked true', () => {
    expect(boolean('Да').checkbox).toEqual({
      on: 'Да',
      off: 'Нет',
      checked: true,
    });
  });

  test('значение «Нет» — checked false', () => {
    expect(boolean('Нет').checkbox).toEqual({
      on: 'Да',
      off: 'Нет',
      checked: false,
    });
  });

  test('пустое значение — checked false', () => {
    expect(boolean('').checkbox?.checked).toBe(false);
  });

  test('on и off берутся из вариантов по порядку, а не из слов «Да» и «Нет»', () => {
    const model = modelOf({
      kind: 'boolean',
      choices: ['Истина', 'Ложь'],
      value: 'Истина',
    });

    expect(model.checkbox).toEqual({
      on: 'Истина',
      off: 'Ложь',
      checked: true,
    });
  });

  test('у других виджетов ключа checkbox нет', () => {
    expect(modelOf({ kind: 'number' })).not.toHaveProperty('checkbox');
    expect(
      modelOf({ kind: 'boolean', choices: YES_NO, optional: true }),
    ).not.toHaveProperty('checkbox');
  });
});

describe('RegionControls — границы числа', () => {
  test('{ min 1, max 99, integer } — bounds с шагом 1', () => {
    const model = modelOf({
      kind: 'number',
      limits: { min: 1, max: 99, integer: true },
    });

    expect(model.bounds).toEqual({ min: 1, max: 99, step: 1 });
  });

  test('без integer — шаг any', () => {
    const model = modelOf({ kind: 'number', limits: { min: 1, max: 99 } });

    expect(model.bounds).toEqual({ min: 1, max: 99, step: 'any' });
  });

  test('только нижний предел — max не задан', () => {
    const model = modelOf({
      kind: 'number',
      limits: { min: 0, integer: true },
    });

    expect(model.bounds).toEqual({ min: 0, step: 1 });
    expect(model.bounds).not.toHaveProperty('max');
  });

  test('число без limits — ключа bounds нет', () => {
    expect(modelOf({ kind: 'number' })).not.toHaveProperty('bounds');
  });

  test('не число: пределы длины строки в bounds не идут', () => {
    const model = modelOf({
      kind: 'string',
      limits: { minLength: 2, maxLength: 8 },
    });

    expect(model).not.toHaveProperty('bounds');
  });
});

describe('RegionControls — help: подсказка, пример и пределы одной строкой', () => {
  test('только подсказка', () => {
    expect(modelOf({ hint: 'Коротко: что нужно сделать' }).help).toBe(
      'Коротко: что нужно сделать',
    );
  });

  test('подсказка и пример', () => {
    expect(
      modelOf({ hint: 'День напоминания', kind: 'date', example: '2026-12-31' })
        .help,
    ).toBe('День напоминания; Пример: 2026-12-31');
  });

  test('подсказка, пример и пределы — через «; »', () => {
    expect(
      modelOf({
        kind: 'number',
        hint: 'Номер части списка, с первой',
        example: 2,
        limits: { min: 1, max: 99, integer: true },
      }).help,
    ).toBe(
      'Номер части списка, с первой; Пример: 2; Пределы: от 1 до 99, целое',
    );
  });

  test('только пример и только пределы — без подсказки', () => {
    expect(modelOf({ example: 'AB-1' }).help).toBe('Пример: AB-1');
    expect(modelOf({ limits: { minLength: 2, maxLength: 8 } }).help).toBe(
      'Пределы: от 2 до 8 символов',
    );
  });

  test('ничего нет — ключа help нет', () => {
    expect(modelOf({})).not.toHaveProperty('help');
  });

  test('пределы без видимых границ — ключа help нет', () => {
    expect(modelOf({ kind: 'number', limits: {} })).not.toHaveProperty('help');
  });

  test('у чекбокса пример не показывается: подсказка остаётся', () => {
    const model = modelOf({
      kind: 'boolean',
      choices: YES_NO,
      hint: 'Срочное напоминание придёт сразу',
      example: true,
    });

    expect(model.help).toBe('Срочное напоминание придёт сразу');
  });

  test('у чекбокса только пример — ключа help нет', () => {
    const model = modelOf({
      kind: 'boolean',
      choices: YES_NO,
      example: true,
    });

    expect(model).not.toHaveProperty('help');
  });
});

describe('RegionControls — состав и круг JSON', () => {
  const KINDS: FieldKind[] = ['string', 'number', 'boolean', 'date', 'choice'];

  test('круг через JSON ничего не меняет: ни одного undefined-ключа', () => {
    const set = setOf(
      form({
        name: 'one',
        available: false,
        reason: 'Причина',
        fields: [
          ...KINDS.map((kind) =>
            field({
              name: kind,
              kind,
              hint: 'Подсказка',
              example: kind === 'number' ? 2 : 'пример',
              ...(kind === 'number'
                ? { limits: { min: 1, integer: true } }
                : {}),
            }),
          ),
          field({ name: 'flag', kind: 'boolean', choices: YES_NO }),
          field({
            name: 'opt',
            kind: 'boolean',
            choices: YES_NO,
            optional: true,
          }),
          field({ name: 'assigneeId' }),
        ],
      }),
      form({ name: 'two', available: false }),
      form({ name: 'three', fields: [field()] }),
    );

    const model = controls.of(set);

    expect(JSON.parse(JSON.stringify(model))).toStrictEqual(model);
  });

  test('жесты строк (open) и локальные действия в кнопки и формы не идут', () => {
    const model = controls.of(
      setOf(
        form({ name: 'open', fields: [field()] }),
        form({ kind: 'local', name: 'toggle' }),
        form({ name: 'next' }),
      ),
    );

    expect(model.actions.map((action) => action.name)).toEqual(['next']);
    expect(model.forms).toEqual([]);
  });
});

describe('RegionControls — клавиша поля основной формы', () => {
  test('основная форма: у первого поля клавиша «/», у остальных ключа hotkey нет', () => {
    const [first, second] = formOf({
      primary: true,
      fields: [field({ name: 'title' }), field({ name: 'note' })],
    }).fields;

    expect(first?.hotkey).toBe('/');
    expect(second).not.toHaveProperty('hotkey');
  });

  test('не основная форма — ключа hotkey нет ни у одного поля', () => {
    const model = formOf({ fields: [field({ name: 'title' })] });

    expect(model.fields[0]).not.toHaveProperty('hotkey');
  });
});
