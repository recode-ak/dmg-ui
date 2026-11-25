import { describe, expect, test } from 'bun:test';
import { TaskEvents } from 'dmg-core/testing/example';
import { OWNER, TASK_A, TASK_B, TaskCardScreenDef } from 'dmg-ui/example';
import * as v from 'valibot';
import { ScreenDef } from './screen-def';

const OTHER = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f';
const byTask = TaskCardScreenDef.refresh[0]!;
const payload = { taskId: TASK_A, ownerId: OWNER };

describe('RefreshOn.matches', () => {
  test('совпали параметр экземпляра и субъект — перечитать', () => {
    expect(byTask.matches(payload, { taskId: TASK_A }, OWNER)).toBe(true);
  });

  test('другой субъект — не перечитывать', () => {
    expect(byTask.matches(payload, { taskId: TASK_A }, OTHER)).toBe(false);
  });

  test('другой параметр экземпляра — не перечитывать', () => {
    expect(byTask.matches(payload, { taskId: TASK_B }, OWNER)).toBe(false);
  });

  test('поля нет ни в payload, ни в параметрах — не перечитывать', () => {
    expect(byTask.matches({ ownerId: OWNER }, {}, OWNER)).toBe(false);
  });

  test('any — перечитать всем', () => {
    // В примере записи `any` нет: сценарий — на локальном Def.
    const everyone = ScreenDef.define({
      name: 'everyone',
      label: 'Всем',
      description: 'Перечитывается у всех по архивации задачи.',
      reads: [],
      data: v.object({}),
      refresh: [{ event: TaskEvents.archived, any: true }],
    });

    expect(everyone.refresh[0]!.matches(payload, {}, undefined)).toBe(true);
  });

  test('запись без params, subject и any — не перечитывать', () => {
    const bare = ScreenDef.define({
      name: 'bare',
      label: 'Без условий',
      description: 'Запись перечитывания без условий.',
      reads: [],
      data: v.object({}),
      refresh: [{ event: TaskEvents.completed }],
    });

    expect(bare.refresh[0]!.matches(payload, {}, OWNER)).toBe(false);
  });
});
