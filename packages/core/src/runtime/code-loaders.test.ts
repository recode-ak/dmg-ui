import { describe, expect, test } from 'bun:test';
import {
  ExampleUiSetDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskListScreenDef,
} from '../../testing/ui-fixture';
import {
  TaskCardScreenCode,
  TaskListScreenCode,
} from '../../testing/ui-fixture-code';
import { TaskAssignedNotificationCode } from '../../testing/ui-notification-code';
import { RuntimeKit } from '../../testing/ui-runtime-fixture';
import { CodeLoader, CodeLoaders } from './code-loaders';

// Карта «Def → загрузчик кода» (С-4 брифа Ф4): манифест кода не знает,
// загрузка — при первом открытии, промис общий у всех исполнителей.

/** Загрузчики фикстуры со счётчиком вызовов загрузчика списка. */
const counted = () => {
  const calls = { list: 0 };
  const codes = CodeLoaders.of(ExampleUiSetDef, [
    CodeLoader.screen(TaskListScreenDef, async () => {
      calls.list += 1;
      return new TaskListScreenCode();
    }),
    CodeLoader.screen(TaskCardScreenDef, async () => new TaskCardScreenCode()),
    CodeLoader.notification(
      TaskAssignedNotificationDef,
      async () => new TaskAssignedNotificationCode(),
    ),
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
      /taskCard.*taskAssigned|taskAssigned.*taskCard/,
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
});
