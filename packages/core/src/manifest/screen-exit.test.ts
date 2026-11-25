import { describe, expect, test } from 'bun:test';
import { TASK_A, TaskListScreenDef } from 'dmg-ui/example';

const { created, closed } = TaskListScreenDef.exits;

describe('ScreenExit', () => {
  test('with() по схеме — значение выхода с именем и данными', () => {
    expect(created.with({ taskId: TASK_A })).toEqual({
      exit: 'created',
      data: { taskId: TASK_A },
    });
  });

  test('данные не по схеме — бросок с именем выхода', () => {
    expect(() => created.with({ taskId: 'не-uuid' })).toThrow('created');
  });

  test('выход без схемы данных — значение без данных', () => {
    expect(closed.with()).toEqual({ exit: 'closed' });
  });

  test('выход ссылается на свой экран', () => {
    expect(created.screen).toBe(TaskListScreenDef);
  });
});
