import { describe, expect, test } from 'bun:test';
import * as v from 'valibot';
import {
  ExampleUiSetDef,
  OWNER,
  TaskAssignedNotificationDef,
  TaskListScreenDef,
  UserCardScreenDef,
  UsersUiModuleDef,
  ViewUserStoryDef,
} from '../../testing/example';
import { TaskAssignedNotificationCode } from '../../testing/example/todo/task-assigned.ncode';
import { todoCodes } from '../../testing/example/todo/todo-codes';
import { UserCardScreenCode } from '../../testing/example/users/user-card.scode';
import { usersCodes } from '../../testing/example/users/users-codes';
import {
  ExampleMenuStubUiAppDef,
  ExampleStubUiAppDef,
} from '../../testing/ui-app.fixture';
import { ScreenDef } from '../manifest/screen-def';
import { UiAppDef } from '../manifest/ui-app-def';
import { UiModuleDef } from '../manifest/ui-module-def';
import { AppCodeLoaders } from './app-code-loaders';
import { CodeLoader, CodeLoaders } from './code-loaders';
import { ModuleRegistries } from './module-registries';

// Сборка кода области — приложения UI или набора целиком — из реестров
// модулей: у каждого модуля области ровно один реестр, иначе отказ UI-06 со
// всеми нарушениями. Код экрана и уведомления — из реестра модуля-хозяина.

/** Модуль вне набора примера и его реестр кода. */
const StrayScreenDef = ScreenDef.define({
  name: 'stray',
  label: 'Вне набора',
  description: 'Экран модуля, которого нет в наборе.',
  reads: [],
  data: v.object({}),
});
const StrayUiModuleDef = UiModuleDef.define({
  name: 'stray',
  label: 'Вне набора',
  description: 'Модуль, которого нет в наборе примера.',
  screens: [StrayScreenDef],
  stories: [],
});
const strayCodes = () =>
  CodeLoaders.of(StrayUiModuleDef, [
    CodeLoader.screen(StrayScreenDef, async () => {
      throw new Error('не нужен');
    }),
  ]);

/** Приложение примера без сторис: один вход на карточку пользователя. */
const UserEntryUiAppDef = UiAppDef.define({
  name: 'exampleUserEntry',
  label: 'Только карточка пользователя',
  description: 'Приложение без сторис со входом на карточку пользователя.',
  set: ExampleUiSetDef,
  channel: 'dmg-ui-stub',
  stories: [],
  entries: {
    user: {
      label: 'Пользователь',
      description: 'Карточка своей учётной записи.',
      address: UserCardScreenDef.at({ userId: OWNER }),
    },
  },
});

/**
 * Приложение примера: сторис карточки пользователя (её связь — сторис
 * задач — отрезана) и уведомление модуля задач.
 */
const UserWithNoticeUiAppDef = UiAppDef.define({
  name: 'exampleUserNotice',
  label: 'Карточка пользователя и уведомление',
  description: 'Сторис модуля пользователей и уведомление модуля задач.',
  set: ExampleUiSetDef,
  channel: 'dmg-ui-stub',
  stories: [ViewUserStoryDef],
  notifications: [TaskAssignedNotificationDef],
  entries: {
    user: {
      label: 'Пользователь',
      description: 'Карточка своей учётной записи.',
      address: UserCardScreenDef.at({ userId: OWNER }),
    },
  },
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

const names = (modules: readonly { readonly name: string }[]) =>
  modules.map((def) => def.name);

describe('AppCodeLoaders — полнота сборки приложения', () => {
  test('нет реестра модуля приложения — отказ UI-06 с именами приложения и модуля', async () => {
    expect(
      await failure(() =>
        AppCodeLoaders.of(ExampleMenuStubUiAppDef, [todoCodes()]),
      ),
    ).toBe(
      'UI-06: CodeLoaders приложения exampleMenuStub: нет реестра модуля users',
    );
  });

  test('реестр модуля вне приложения — отказ UI-06 «вне приложения»', async () => {
    expect(
      await failure(() =>
        AppCodeLoaders.of(ExampleStubUiAppDef, [todoCodes(), usersCodes()]),
      ),
    ).toBe(
      'UI-06: CodeLoaders приложения exampleStub: реестр модуля users вне приложения',
    );
  });

  test('два реестра одного модуля — отказ UI-06 «два реестра модуля»', async () => {
    expect(
      await failure(() =>
        AppCodeLoaders.of(ExampleStubUiAppDef, [todoCodes(), todoCodes()]),
      ),
    ).toBe(
      'UI-06: CodeLoaders приложения exampleStub: два реестра модуля todo',
    );
  });
});

describe('AppCodeLoaders — полнота сборки набора', () => {
  test('нет реестра модуля набора — отказ UI-06 с именами набора и модуля', async () => {
    expect(
      await failure(() => AppCodeLoaders.ofSet(ExampleUiSetDef, [todoCodes()])),
    ).toBe('UI-06: CodeLoaders набора exampleUi: нет реестра модуля users');
  });

  test('реестры всех модулей набора — сборка без отказа', async () => {
    expect(
      await failure(() =>
        AppCodeLoaders.ofSet(ExampleUiSetDef, [todoCodes(), usersCodes()]),
      ),
    ).toBeUndefined();
  });

  test('реестр модуля другого набора — отказ UI-06 «вне набора»', async () => {
    expect(
      await failure(() =>
        AppCodeLoaders.ofSet(ExampleUiSetDef, [
          todoCodes(),
          usersCodes(),
          strayCodes(),
        ]),
      ),
    ).toBe(
      'UI-06: CodeLoaders набора exampleUi: реестр модуля stray вне набора',
    );
  });

  test('нарушения сборки сразу — один отказ, строка UI-06 на каждое: нет, вне, два', async () => {
    expect(
      await failure(() =>
        AppCodeLoaders.ofSet(ExampleUiSetDef, [
          todoCodes(),
          strayCodes(),
          todoCodes(),
        ]),
      ),
    ).toBe(
      [
        'UI-06: CodeLoaders набора exampleUi: нет реестра модуля users',
        'UI-06: CodeLoaders набора exampleUi: реестр модуля stray вне набора',
        'UI-06: CodeLoaders набора exampleUi: два реестра модуля todo',
      ].join('\n'),
    );
  });
});

describe('ModuleRegistries.required — модули области', () => {
  test('набор — все его модули в порядке набора', () => {
    expect(names(ModuleRegistries.required(ExampleUiSetDef))).toEqual([
      'todo',
      'users',
    ]);
  });

  test('приложение — хозяева его сторис и их экранов', () => {
    expect(names(ModuleRegistries.required(ExampleMenuStubUiAppDef))).toEqual([
      'todo',
      'users',
    ]);
  });

  test('модуль отрезанной сторис в приложение не входит', () => {
    expect(names(ModuleRegistries.required(ExampleStubUiAppDef))).toEqual([
      'todo',
    ]);
  });

  test('приложение без сторис со входом — модуль экрана входа', () => {
    expect(names(ModuleRegistries.required(UserEntryUiAppDef))).toEqual([
      'users',
    ]);
  });

  test('уведомление приложения — модуль-хозяин; порядок — модулей набора', () => {
    expect(names(ModuleRegistries.required(UserWithNoticeUiAppDef))).toEqual([
      'todo',
      'users',
    ]);
  });
});

describe('AppCodeLoaders — область и код', () => {
  test('сборка приложения — его набор и приложение; сборка набора — без приложения', () => {
    const app = AppCodeLoaders.of(ExampleStubUiAppDef, [todoCodes()]);
    const set = AppCodeLoaders.ofSet(ExampleUiSetDef, [
      todoCodes(),
      usersCodes(),
    ]);

    expect(app.set).toBe(ExampleUiSetDef);
    expect(app.app).toBe(ExampleStubUiAppDef);
    expect(set.set).toBe(ExampleUiSetDef);
    expect(set.app).toBeUndefined();
  });

  test('код экрана — из реестра модуля-хозяина', async () => {
    let loads = 0;
    const users = CodeLoaders.of(UsersUiModuleDef, [
      CodeLoader.screen(UserCardScreenDef, async () => {
        loads += 1;
        return new UserCardScreenCode();
      }),
    ]);
    const codes = AppCodeLoaders.ofSet(ExampleUiSetDef, [todoCodes(), users]);

    const unit = await codes.screen(UserCardScreenDef);

    expect(unit.def).toBe(UserCardScreenDef);
    expect(loads).toBe(1);
  });

  test('код уведомления — из реестра модуля-хозяина', async () => {
    const note = new TaskAssignedNotificationCode();
    const codes = AppCodeLoaders.ofSet(ExampleUiSetDef, [
      todoCodes({ assignedNote: note }),
      usersCodes(),
    ]);

    expect(await codes.notification(TaskAssignedNotificationDef)).toBe(note);
  });

  test('экран вне сборки — бросок с именами экрана и области', async () => {
    const codes = AppCodeLoaders.of(ExampleStubUiAppDef, [todoCodes()]);

    expect(await failure(() => codes.screen(UserCardScreenDef))).toMatch(
      /userCard.*exampleStub/,
    );
  });

  test('has: экран модуля сборки — есть, экран модуля вне сборки — нет', () => {
    const codes = AppCodeLoaders.of(ExampleStubUiAppDef, [todoCodes()]);

    expect(codes.has(TaskListScreenDef)).toBe(true);
    expect(codes.has(UserCardScreenDef)).toBe(false);
  });
});
