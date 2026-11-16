import { describe, expect, test } from 'bun:test';
import { UiScene } from '../../../testing/ui-arch';

const run = (fields: string[]) => {
  const n = UiScene.notification('n', {
    recipients: { from: 'payload', fields },
  });
  return new UiScene({ screens: [], notifications: [n] }).report();
};

describe('UI-18: получатели уведомления — поля payload события', () => {
  test('нарушение: поля нет в payload события', () => {
    const report = run(['nope']);

    expect(report.code).toBe(1);
    expect(report.rule('UI-18')).toEqual([
      'UI-18: уведомление miniUi/todo/n: поля nope нет в payload события example/todo/task/assigned',
    ]);
  });

  test('нарушение: список получателей пуст', () => {
    const [line, ...rest] = run([]).rule('UI-18');

    expect(rest).toEqual([]);
    expect(line).toStartWith('UI-18: уведомление miniUi/todo/n: ');
    expect(line).toContain('пуст');
  });

  test('без нарушения: несколько полей, все в payload', () => {
    expect(run(['assigneeId', 'ownerId']).rule('UI-18')).toEqual([]);
  });
});
