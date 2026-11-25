import { describe, expect, test } from 'bun:test';
import {
  AssignedTasksScreenCode,
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  MainMenuScreenCode,
  MainMenuScreenDef,
  TaskAssignedNotificationCode,
  TaskAssignedNotificationDef,
  TaskCardScreenCode,
  TaskCardScreenDef,
  TaskCompletedNotificationCode,
  TaskCompletedNotificationDef,
  TaskListScreenCode,
  TaskListScreenDef,
  TodoUiModuleDef,
  UserCardScreenCode,
  UserCardScreenDef,
  usersCodes,
} from 'dmg-ui/example';
import * as v from 'valibot';
import { RuntimeKit } from '../../testing/ui-runtime.fixture';
import { ScreenDef } from '../manifest/screen-def';
import { AppCodeLoaders } from './app-code-loaders';
import { CodeLoader, CodeLoaders } from './code-loaders';

// Реестр кода одного UI-модуля: каждому экрану и уведомлению модуля — ровно
// один загрузчик, иначе отказ UI-06 со всеми нарушениями. Код грузится при
// первом обращении; промис общий у всех исполнителей сборки, сбой загрузки
// не кэшируется.

/** Загрузчики модуля `todo`, кроме списка. */
const todoRest = [
  CodeLoader.screen(TaskCardScreenDef, async () => new TaskCardScreenCode()),
  CodeLoader.screen(
    AssignedTasksScreenDef,
    async () => new AssignedTasksScreenCode(),
  ),
  CodeLoader.screen(MainMenuScreenDef, async () => new MainMenuScreenCode()),
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
/** Загрузчик экрана соседнего модуля `users`. */
const userLoader = CodeLoader.screen(
  UserCardScreenDef,
  async () => new UserCardScreenCode(),
);

/** Экран вне набора примера. */
const StrayScreenDef = ScreenDef.define({
  name: 'stray',
  label: 'Вне набора',
  description: 'Экран, которого нет в наборе.',
  reads: [],
  data: v.object({}),
});
const strayLoader = CodeLoader.screen(StrayScreenDef, async () => {
  throw new Error('не нужен');
});

/** Текст броска вызова (синхронного или отказа промиса); не бросил — `undefined`. */
const failure = async (run: () => unknown): Promise<string | undefined> => {
  try {
    await run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
};

/** Сборка набора примера со счётчиком вызовов загрузчика списка. */
const counted = () => {
  const calls = { list: 0 };
  const todo = CodeLoaders.of(TodoUiModuleDef, [
    CodeLoader.screen(TaskListScreenDef, async () => {
      calls.list += 1;
      return new TaskListScreenCode();
    }),
    ...todoRest,
  ]);
  const codes = AppCodeLoaders.ofSet(ExampleUiSetDef, [todo, usersCodes()]);
  return { calls, codes };
};

describe('CodeLoaders — полнота реестра модуля', () => {
  test('полный реестр — модуль реестра и код экрана модуля по Def', async () => {
    const codes = CodeLoaders.of(TodoUiModuleDef, [listLoader, ...todoRest]);

    const unit = await codes.screen(TaskListScreenDef);

    expect(codes.module).toBe(TodoUiModuleDef);
    expect(unit.def).toBe(TaskListScreenDef);
  });

  test('экран и уведомление модуля без загрузчика — отказ UI-06 с именами реестра, модуля и Def', async () => {
    expect(
      await failure(() => CodeLoaders.of(TodoUiModuleDef, [listLoader])),
    ).toBe(
      'UI-06: CodeLoaders модуля todo: нет загрузчика для taskCard, assignedTasks, mainMenu, taskAssigned, taskCompleted',
    );
  });

  test('загрузчик экрана соседнего модуля — отказ UI-06 «вне модуля»', async () => {
    expect(
      await failure(() =>
        CodeLoaders.of(TodoUiModuleDef, [listLoader, ...todoRest, userLoader]),
      ),
    ).toBe('UI-06: CodeLoaders модуля todo: userCard вне модуля');
  });

  test('загрузчик экрана вне набора — отказ UI-06 «вне модуля»', async () => {
    expect(
      await failure(() =>
        CodeLoaders.of(TodoUiModuleDef, [listLoader, ...todoRest, strayLoader]),
      ),
    ).toBe('UI-06: CodeLoaders модуля todo: stray вне модуля');
  });

  test('два загрузчика на один экран — отказ UI-06 «два для»', async () => {
    expect(
      await failure(() =>
        CodeLoaders.of(TodoUiModuleDef, [listLoader, listLoader, ...todoRest]),
      ),
    ).toBe('UI-06: CodeLoaders модуля todo: два для taskList');
  });

  test('неполнота, лишний и двойной загрузчик сразу — один отказ, строка UI-06 на каждое нарушение: нет, вне, два', async () => {
    expect(
      await failure(() =>
        CodeLoaders.of(TodoUiModuleDef, [listLoader, listLoader, userLoader]),
      ),
    ).toBe(
      [
        'UI-06: CodeLoaders модуля todo: нет загрузчика для taskCard, assignedTasks, mainMenu, taskAssigned, taskCompleted',
        'UI-06: CodeLoaders модуля todo: userCard вне модуля',
        'UI-06: CodeLoaders модуля todo: два для taskList',
      ].join('\n'),
    );
  });

  test('поиск экрана вне модуля — бросок с именем экрана, без ID правила', async () => {
    const codes = CodeLoaders.of(TodoUiModuleDef, [listLoader, ...todoRest]);

    const message = await failure(() => codes.screen(UserCardScreenDef));

    expect(message).toContain('userCard');
    expect(message).not.toContain('UI-06');
  });
});

describe('CodeLoaders — ленивая загрузка', () => {
  test('до open загрузчик не вызван', () => {
    const { calls, codes } = counted();

    new RuntimeKit(codes);

    expect(calls.list).toBe(0);
  });

  test('загрузчик вызывается один раз на два open и два исполнителя одной сборки', async () => {
    const { calls, codes } = counted();
    const first = new RuntimeKit(codes);
    const second = new RuntimeKit(codes);

    await first.openList();
    await first.openList();
    await second.openList();

    expect(calls.list).toBe(1);
  });

  test('сбой загрузки не кэшируется — следующий вызов грузит заново', async () => {
    let calls = 0;
    const flaky = CodeLoader.screen(TaskListScreenDef, async () => {
      calls += 1;
      if (calls === 1) throw new Error('нет сети');
      return new TaskListScreenCode();
    });
    const codes = CodeLoaders.of(TodoUiModuleDef, [flaky, ...todoRest]);

    await expect(codes.screen(TaskListScreenDef)).rejects.toThrow('нет сети');
    await codes.screen(TaskListScreenDef);

    expect(calls).toBe(2);
  });
});
