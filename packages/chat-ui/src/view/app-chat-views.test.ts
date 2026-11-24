import { describe, expect, test } from 'bun:test';
import { UiIds } from 'dmg-ui';
import {
  ExampleUiSetDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskListScreenDef,
  UserCardScreenDef,
} from 'dmg-ui/testing';
import {
  ExampleDialogUiAppDef,
  ExampleWindowedUiAppDef,
  todoChatViews,
  usersChatViews,
} from '../../testing';
import { AppChatViews } from './app-chat-views';
import { ScreenPresenter } from './screen-presenter';

// Сборка представлений мессенджера для области — приложения UI или набора
// целиком — из реестров модулей (`ChatViews`): у каждого модуля области
// ровно один реестр, иначе отказ UI-06 с именем `ChatViews`. Поиск — по `id`
// из `UiIds`: представление берётся у реестра модуля-хозяина. Перекрытия у
// сборки нет: перекрытый реестр модуля входит в неё вместо базового.

const ids = new UiIds(ExampleUiSetDef);
const LIST = ids.screen(TaskListScreenDef);
const CARD = ids.screen(TaskCardScreenDef);
const USER = ids.screen(UserCardScreenDef);
const ASSIGNED = ids.notification(TaskAssignedNotificationDef);

/** Сборка набора примера из базовых реестров модулей. */
const ofSet = () =>
  AppChatViews.ofSet(ExampleUiSetDef, [todoChatViews, usersChatViews]);

/** Текст броска вызова; не бросил — `undefined`. */
const failure = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
};

describe('AppChatViews — поиск по id', () => {
  test('экран и уведомление по id из UiIds — представление реестра модуля-хозяина', () => {
    const views = ofSet();

    expect(views.screen(LIST)).toBe(todoChatViews.screen(TaskListScreenDef));
    expect(views.screen(USER)).toBe(usersChatViews.screen(UserCardScreenDef));
    expect(views.notification(ASSIGNED)).toBe(
      todoChatViews.notification(TaskAssignedNotificationDef),
    );
  });

  test('неизвестный id экрана и уведомления, id экрана как уведомление — бросок с id', () => {
    const views = ofSet();
    const missing = 'exampleUi/todo/missing';

    expect(() => views.screen(missing)).toThrow(
      `ChatViews: нет представления экрана ${missing}`,
    );
    expect(() => views.notification(missing)).toThrow(
      `ChatViews: нет представления уведомления ${missing}`,
    );
    expect(() => views.notification(LIST)).toThrow(LIST);
  });

  test('экран модуля вне сборки приложения — бросок с id', () => {
    const views = AppChatViews.of(ExampleWindowedUiAppDef, [todoChatViews]);

    expect(() => views.screen(USER)).toThrow(USER);
  });
});

describe('AppChatViews — состав', () => {
  test('сборка набора — набор без приложения; сборка приложения — его набор и приложение', () => {
    const set = ofSet();
    const app = AppChatViews.of(ExampleWindowedUiAppDef, [todoChatViews]);

    expect(set.set).toBe(ExampleUiSetDef);
    expect(set.app).toBeUndefined();
    expect(app.set).toBe(ExampleUiSetDef);
    expect(app.app).toBe(ExampleWindowedUiAppDef);
  });

  test('registry — реестр модуля-хозяина Def; registries — реестры в порядке передачи', () => {
    const views = ofSet();

    expect(views.registry(UserCardScreenDef)).toBe(usersChatViews);
    expect(views.registry(TaskAssignedNotificationDef)).toBe(todoChatViews);
    expect(views.registries()).toEqual([todoChatViews, usersChatViews]);
  });

  test('registry: Def модуля вне сборки — бросок с именами Def и приложения', () => {
    const views = AppChatViews.of(ExampleWindowedUiAppDef, [todoChatViews]);

    expect(() => views.registry(UserCardScreenDef)).toThrow(
      /userCard.*exampleWindowed/,
    );
  });

  test('перекрытый реестр модуля вместо базового: перекрытое — из слоя, остальное — из базы', () => {
    const ownCard = ScreenPresenter.for(
      TaskCardScreenDef,
      () => 'Своя карточка',
    );

    const views = AppChatViews.ofSet(ExampleUiSetDef, [
      todoChatViews.over([ownCard]),
      usersChatViews,
    ]);

    expect(views.screen(CARD)).toBe(ownCard);
    expect(views.screen(LIST)).toBe(todoChatViews.screen(TaskListScreenDef));
    expect(views.screen(USER)).toBe(usersChatViews.screen(UserCardScreenDef));
  });
});

describe('AppChatViews — полнота сборки (UI-06)', () => {
  test('сборка приложения без реестра модуля приложения — отказ UI-06 с именем ChatViews', () => {
    expect(
      failure(() => AppChatViews.of(ExampleDialogUiAppDef, [todoChatViews])),
    ).toBe(
      'UI-06: ChatViews приложения exampleDialog: нет реестра модуля users',
    );
  });

  test('базовый и перекрытый реестр одного модуля сразу — отказ UI-06 «два реестра»', () => {
    const ownCard = ScreenPresenter.for(
      TaskCardScreenDef,
      () => 'Своя карточка',
    );

    expect(
      failure(() =>
        AppChatViews.ofSet(ExampleUiSetDef, [
          todoChatViews,
          todoChatViews.over([ownCard]),
          usersChatViews,
        ]),
      ),
    ).toBe('UI-06: ChatViews набора exampleUi: два реестра модуля todo');
  });

  test('сборка набора без реестра модуля — отказ UI-06 набора', () => {
    expect(
      failure(() => AppChatViews.ofSet(ExampleUiSetDef, [todoChatViews])),
    ).toBe('UI-06: ChatViews набора exampleUi: нет реестра модуля users');
  });
});
