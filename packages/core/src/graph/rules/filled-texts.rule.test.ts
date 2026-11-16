import { describe, expect, test } from 'bun:test';
import { CreateTaskUcDef } from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';

const TEXTS = { label: 'Подпись', description: 'Описание.' };
const DONE = { done: TEXTS };

/** Строки UI-13 для сцены: экран `a` в сторис `s` с заданными частями. */
const run = (
  screen: Parameters<typeof UiScene.screen>[1] = {},
  story: Parameters<typeof UiScene.story>[2] = {},
) => {
  const a = UiScene.screen('a', screen);
  return new UiScene({
    screens: [a],
    stories: [UiScene.story('s', [a], story)],
  }).report();
};

describe('UI-13: тексты узлов и элементов заполнены', () => {
  test('нарушение: пустая подпись экрана', () => {
    const report = run({ label: '' });

    expect(report.code).toBe(1);
    expect(report.rule('UI-13')).toEqual([
      expect.stringContaining(
        'UI-13: miniUi/todo/a: пустой или не заполненный (TODO) label у',
      ),
    ]);
  });

  test('нарушение: описание сторис начинается с TODO', () => {
    const [line, ...rest] = run({}, { description: 'TODO: описать' }).rule(
      'UI-13',
    );

    expect(rest).toEqual([]);
    expect(line).toStartWith(
      'UI-13: miniUi/todo/s: пустой или не заполненный (TODO) description у',
    );
  });

  test('нарушение: пустая подпись действия — узел действия', () => {
    const action = { label: '', description: 'Вызов.', uc: CreateTaskUcDef };

    const [line] = run({ actions: { go: action } }).rule('UI-13');

    expect(line).toStartWith(
      'UI-13: miniUi/todo/a/go: пустой или не заполненный (TODO) label у',
    );
  });

  test('нарушение: пустая подпись выхода экрана', () => {
    const [line] = run({ exits: { done: { ...TEXTS, label: '' } } }).rule(
      'UI-13',
    );

    expect(line).toStartWith('UI-13: miniUi/todo/a: ');
    expect(line).toContain('label');
    expect(line).toContain('done');
  });

  test('нарушение: пустое описание локального действия', () => {
    const [line] = run({
      locals: { pick: { ...TEXTS, description: '' } },
    }).rule('UI-13');

    expect(line).toStartWith('UI-13: miniUi/todo/a: ');
    expect(line).toContain('description');
    expect(line).toContain('pick');
  });

  test('нарушение: подтверждение действия с пустой подписью', () => {
    const action = { ...TEXTS, confirm: { ...TEXTS, label: '' } };

    const [line] = run({ actions: { go: action } }).rule('UI-13');

    expect(line).toStartWith('UI-13: miniUi/todo/a/go: ');
    expect(line).toContain('label');
  });

  test('нарушение: пустое описание исхода сторис', () => {
    const a = UiScene.screen('a', { exits: DONE });
    const outcome = {
      ...TEXTS,
      description: '',
      exits: [UiScene.exit(a, 'done')],
    };
    const scene = new UiScene({
      screens: [a],
      stories: [UiScene.story('s', [a], { outcomes: { finished: outcome } })],
    });

    const [line] = scene.report().rule('UI-13');

    expect(line).toStartWith('UI-13: miniUi/todo/s: ');
    expect(line).toContain('description');
    expect(line).toContain('finished');
  });

  test('нарушение: пустая подпись входа приложения UI', () => {
    const a = UiScene.screen('a');
    const entry = { ...UiScene.entry(a), label: '' };
    const scene = new UiScene({
      screens: [a],
      stories: [UiScene.story('s', [a])],
      entries: { start: entry },
    });

    const [line] = scene.report().rule('UI-13');

    expect(line).toStartWith('UI-13: miniConsole: ');
    expect(line).toContain('label');
    expect(line).toContain('start');
  });

  test('без нарушения: TODO не в начале текста', () => {
    const report = run({ description: 'Список дел (TODO-лист) пользователя.' });

    expect(report.rule('UI-13')).toEqual([]);
  });
});
