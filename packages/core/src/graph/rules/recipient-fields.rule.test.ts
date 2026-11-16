import { describe, expect, test } from 'bun:test';
import {
  GetTaskUcDef,
  ListTasksUcDef,
  RemoveUserUcDef,
} from 'dmg-core/testing/example';
import { UiScene } from '../../../testing/ui-arch';
import type { RecipientsSpec } from '../../manifest/notification-def';

const report = (recipients: RecipientsSpec) => {
  const n = UiScene.notification('n', { recipients });
  return new UiScene({ screens: [], notifications: [n] }).report();
};

const run = (fields: string[]) => report({ from: 'payload', fields });

/** Строки UI-18 при получателях из выхода `uc` с входом `input`. */
const query = (
  uc: Extract<RecipientsSpec, { from: 'query' }>['uc'],
  input: Readonly<Record<string, string>>,
) => report({ from: 'query', uc, input, fields: ['ownerId'] }).rule('UI-18');

const HEAD = 'UI-18: уведомление miniUi/todo/n: ';

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

describe('UI-18: получатели из выхода query UC (from: query)', () => {
  test('без нарушения: query UC с system в callers, вход — из полей payload', () => {
    expect(query(GetTaskUcDef, { taskId: 'taskId' })).toEqual([]);
  });

  test('нарушение: UC получателей — не query', () => {
    const [line, ...rest] = query(RemoveUserUcDef, { userId: 'assigneeId' });

    expect(rest).toEqual([]);
    expect(line).toStartWith(HEAD);
    expect(line).toContain('removeUser');
  });

  test('нарушение: в callers UC нет system', () => {
    const [line, ...rest] = query(ListTasksUcDef, {});

    expect(rest).toEqual([]);
    expect(line).toStartWith(HEAD);
    expect(line).toContain('listTasks');
  });

  test('нарушение: значение входа — не поле payload события', () => {
    const [line, ...rest] = query(GetTaskUcDef, { taskId: 'nope' });

    expect(rest).toEqual([]);
    expect(line).toStartWith(HEAD);
    expect(line).toContain('nope');
  });
});
