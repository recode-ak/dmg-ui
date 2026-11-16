import { describe, expect, test } from 'bun:test';
import { TaskEvents } from 'dmg-core/testing/example';
import * as v from 'valibot';
import { UiScene } from '../../../testing/ui-arch';
import type { RefreshSpec } from '../../manifest/screen-def';

type Refresh = readonly RefreshSpec[];

const params = v.strictObject({
  taskId: v.pipe(v.string(), v.description('Задача')),
});
const run = (refresh: Refresh) =>
  new UiScene({ screens: [UiScene.screen('a', { params, refresh })] })
    .report()
    .rule('UI-17');
const completed = TaskEvents.completed;
const EVENT = 'example/todo/task/completed';

describe('UI-17: запись refresh согласована с экраном и событием', () => {
  test('нарушение: ключ записи — не параметр экрана', () => {
    const [line, ...rest] = run([
      { event: completed, params: { x: 'taskId' } },
    ]);

    expect(rest).toEqual([]);
    expect(line).toStartWith('UI-17: ');
    expect(line).toContain('miniUi/todo/a');
    expect(line).toContain('ключ x не параметр экрана');
  });

  test('нарушение: значение params — не поле payload события', () => {
    const [line] = run([{ event: completed, params: { taskId: 'nope' } }]);

    expect(line).toContain(`поля nope нет в payload события ${EVENT}`);
  });

  test('нарушение: subject — не поле payload события', () => {
    const [line] = run([{ event: completed, subject: 'nope' }]);

    expect(line).toContain(`поля nope нет в payload события ${EVENT}`);
  });

  test('нарушение: запись без params, subject и any', () => {
    const [line] = run([{ event: completed }]);

    expect(line).toStartWith('UI-17: ');
    expect(line).toContain('запись без params, subject и any');
  });

  test('без нарушения: any — явное «всем»', () => {
    expect(run([{ event: completed, any: true }])).toEqual([]);
  });

  test('без нарушения: ключ — параметр экрана, значение и subject — в payload', () => {
    const record = { event: completed, params: { taskId: 'taskId' } };

    expect(run([{ ...record, subject: 'ownerId' }])).toEqual([]);
  });

  test('две записи на одно событие: нарушает только неверная', () => {
    const lines = run([
      { event: completed, any: true },
      { event: completed, subject: 'nope' },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('поля nope нет в payload события');
  });
});
