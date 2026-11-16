import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from '../../testing/example';
import { AssignedTasksScreenCode } from '../../testing/example/todo/assigned-tasks.code';
import { TaskAssignedNotificationCode } from '../../testing/example/todo/task-assigned.code';
import { TaskCardScreenCode } from '../../testing/example/todo/task-card.code';
import { TaskCompletedNotificationCode } from '../../testing/example/todo/task-completed.code';
import { TaskListScreenCode } from '../../testing/example/todo/task-list.code';
import { RuntimeKit } from '../../testing/ui-runtime-fixture';
import { ScreenDef } from '../manifest/screen-def';
import { CodeLoader, CodeLoaders } from './code-loaders';

/** Загрузчики примера, кроме списка. */
const others = [
  CodeLoader.screen(TaskCardScreenDef, async () => new TaskCardScreenCode()),
  CodeLoader.screen(
    AssignedTasksScreenDef,
    async () => new AssignedTasksScreenCode(),
  ),
  CodeLoader.notification(
    TaskAssignedNotificationDef,
    async () => new TaskAssignedNotificationCode(),
  ),
  CodeLoader.notification(
    TaskCompletedNotificationDef,
    async () => new TaskCompletedNotificationCode(),
  ),
];
const listLoader = CodeLoader.screen(
  TaskListScreenDef,
  async () => new TaskListScreenCode(),
);

/** Экран вне набора примера. */
const StrayScreenDef = ScreenDef.define({
  name: 'stray',
  label: 'Вне набора',
  description: 'Экран, которого нет в наборе.',
  reads: [],
  data: v.object({}),
});

// Карта «Def → загрузчик кода» в корне сборки: манифест кода не знает,
// загрузка — при первом открытии, промис общий у всех исполнителей, сбой
// загрузки не кэшируется.

/** Загрузчики примера со счётчиком вызовов загрузчика списка. */
const counted = () => {
  const calls = { list: 0 };
  const codes = CodeLoaders.of(ExampleUiSetDef, [
    CodeLoader.screen(TaskListScreenDef, async () => {
      calls.list += 1;
      return new TaskListScreenCode();
    }),
    ...others,
  ]);
  return { calls, codes };
};

describe('CodeLoaders', () => {
  test('экран и уведомление набора без загрузчика — бросок со списком имён', () => {
    const only = [
      CodeLoader.screen(
        TaskListScreenDef,
        async () => new TaskListScreenCode(),
      ),
    ];

    expect(() => CodeLoaders.of(ExampleUiSetDef, only)).toThrow(
      'taskCard, assignedTasks, taskAssigned, taskCompleted',
    );
  });

  test('до open загрузчик не вызван', () => {
    const { calls, codes } = counted();

    new RuntimeKit(codes);

    expect(calls.list).toBe(0);
  });

  test('загрузчик вызывается один раз на два open и два исполнителя', async () => {
    const { calls, codes } = counted();
    const first = new RuntimeKit(codes);
    const second = new RuntimeKit(codes);

    await first.openList();
    await first.openList();
    await second.openList();

    expect(calls.list).toBe(1);
  });

  test('два загрузчика на один экран — бросок с именем', () => {
    expect(() =>
      CodeLoaders.of(ExampleUiSetDef, [listLoader, listLoader, ...others]),
    ).toThrow('taskList');
  });

  test('загрузчик экрана вне набора — бросок с именем', () => {
    const stray = CodeLoader.screen(StrayScreenDef, async () => {
      throw new Error('не нужен');
    });

    expect(() =>
      CodeLoaders.of(ExampleUiSetDef, [listLoader, stray, ...others]),
    ).toThrow('stray');
  });

  test('сбой загрузки не кэшируется — следующий вызов грузит заново', async () => {
    let calls = 0;
    const flaky = CodeLoader.screen(TaskListScreenDef, async () => {
      calls += 1;
      if (calls === 1) throw new Error('нет сети');
      return new TaskListScreenCode();
    });
    const codes = CodeLoaders.of(ExampleUiSetDef, [flaky, ...others]);

    await expect(codes.screen(TaskListScreenDef)).rejects.toThrow('нет сети');
    await codes.screen(TaskListScreenDef);

    expect(calls).toBe(2);
  });
});
