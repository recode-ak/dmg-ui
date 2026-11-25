import { describe, expect, test } from 'bun:test';
import { UiIds } from 'dmg-ui';
import {
  ExamplePagesUiAppDef,
  ExampleUiSetDef,
  TaskAssignedNotificationDef,
  TaskListScreenDef,
  UserCardScreenDef,
} from 'dmg-ui/example';
import { examplePagesViews } from '../../testing/text-views/example-pages.views';
import { todoPagesViews } from '../../testing/text-views/todo-pages.views';
import { usersPagesViews } from '../../testing/text-views/users-pages.views';
import { AppPageViews } from './app-page-views';

// Сборка представлений страницы для области — приложения UI или набора
// целиком — из реестров модулей (`PageViews`): у каждого модуля области
// ровно один реестр, иначе отказ UI-06 с именем `PageViews`. Поиск — по `id`
// из `UiIds` у реестра модуля-хозяина; уведомление по `id` из внешних данных
// ищется без броска (`findNotification`).

const ids = new UiIds(ExampleUiSetDef);
const LIST = ids.screen(TaskListScreenDef);
const USER = ids.screen(UserCardScreenDef);
const ASSIGNED = ids.notification(TaskAssignedNotificationDef);
const MISSING = 'exampleUi/todo/missing';

/** Сборка набора примера: реестры всех его модулей. */
const ofSet = () => examplePagesViews();

/** Текст броска вызова; не бросил — `undefined`. */
const failure = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
};

describe('AppPageViews — поиск по id', () => {
  test('экран и уведомление по id из UiIds — представление реестра модуля-хозяина', () => {
    const views = ofSet();

    expect(views.screen(LIST)).toBe(todoPagesViews.screen(TaskListScreenDef));
    expect(views.screen(USER)).toBe(usersPagesViews.screen(UserCardScreenDef));
    expect(views.notification(ASSIGNED)).toBe(
      todoPagesViews.notification(TaskAssignedNotificationDef),
    );
  });

  test('findNotification: известное — представление, неизвестное и id экрана — undefined', () => {
    const views = ofSet();

    expect(views.findNotification(ASSIGNED)).toBe(
      todoPagesViews.notification(TaskAssignedNotificationDef),
    );
    expect(views.findNotification(MISSING)).toBeUndefined();
    expect(views.findNotification(LIST)).toBeUndefined();
  });

  test('screen и notification неизвестного id — бросок с id', () => {
    const views = ofSet();

    expect(() => views.screen(MISSING)).toThrow(MISSING);
    expect(() => views.notification(MISSING)).toThrow(MISSING);
  });

  test('сборка приложения — его набор и приложение; сборка набора — без приложения', () => {
    const app = examplePagesViews(ExamplePagesUiAppDef);

    expect(app.set).toBe(ExampleUiSetDef);
    expect(app.app).toBe(ExamplePagesUiAppDef);
    expect(ofSet().app).toBeUndefined();
  });
});

describe('AppPageViews — полнота сборки (UI-06)', () => {
  test('сборка приложения без реестра модуля приложения — отказ UI-06 с именем PageViews', () => {
    expect(
      failure(() => AppPageViews.of(ExamplePagesUiAppDef, [todoPagesViews])),
    ).toBe(
      'UI-06: PageViews приложения examplePages: нет реестра модуля users',
    );
  });
});
