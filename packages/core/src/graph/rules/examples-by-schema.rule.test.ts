import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import { UiScene } from '../../../testing/ui-arch';

const field = (text: string) => v.pipe(v.number(), v.description(text));
const shape = {
  params: v.strictObject({ index: field('Смещение') }),
  data: v.object({ ok: v.boolean() }),
  state: v.strictObject({ n: field('Счётчик') }),
};
const GOOD = [{ index: 0 }, { ok: true }, { n: 1 }] as const;

const run = (params: unknown, data: unknown, state: unknown) => {
  const example = UiScene.example(params, data, state);
  const screen = UiScene.screen('a', { ...shape, examples: { bad: example } });
  return new UiScene({ screens: [screen] }).report();
};

describe('UI-20: примеры проходят схемы экрана и уведомления', () => {
  test('нарушение: params примера не по схеме', () => {
    const report = run({ index: 'x' }, GOOD[1], GOOD[2]);

    expect(report.code).toBe(1);
    expect(report.rule('UI-20')).toEqual([
      expect.stringMatching(
        /^UI-20: miniUi\/todo\/a: пример bad не по схеме params: ./,
      ),
    ]);
  });

  test('нарушение: data примера не по схеме', () => {
    const [line] = run(GOOD[0], { ok: 'x' }, GOOD[2]).rule('UI-20');

    expect(line).toStartWith(
      'UI-20: miniUi/todo/a: пример bad не по схеме data: ',
    );
  });

  test('нарушение: state примера не по схеме', () => {
    const [line] = run(GOOD[0], GOOD[1], { n: 'x' }).rule('UI-20');

    expect(line).toStartWith(
      'UI-20: miniUi/todo/a: пример bad не по схеме state: ',
    );
  });

  test('нарушение: data примера уведомления не по схеме', () => {
    const n = UiScene.notification('n', {
      data: v.object({ title: v.string() }),
      examples: {
        sample: { label: 'Пример', description: 'Пример.', data: { title: 1 } },
      },
    });

    const [line] = new UiScene({ screens: [], notifications: [n] })
      .report()
      .rule('UI-20');

    expect(line).toStartWith(
      'UI-20: miniUi/todo/n: пример sample не по схеме data: ',
    );
  });

  test('без нарушения: params, data и state примера по схемам', () => {
    expect(run(GOOD[0], GOOD[1], GOOD[2]).rule('UI-20')).toEqual([]);
  });
});
