import { describe, expect, test } from 'bun:test';
import {
  AssignedTasksScreenDef,
  MainMenuScreenDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  TodoUiModuleDef,
  UserCardScreenDef,
} from 'dmg-ui/example';
import { PageNotePresenter, PagePresenter, PageViews } from './page-views';

// Реестр представлений одного UI-модуля на странице (образец — реестр
// модуля в мессенджере): ключ — Def экрана и уведомления модуля; каждому —
// ровно одно представление, иначе отказ UI-06 со всеми нарушениями.

const list = PagePresenter.for(TaskListScreenDef, () => 'список');
const card = PagePresenter.for(TaskCardScreenDef, () => 'карточка');
const assignedTasks = PagePresenter.for(
  AssignedTasksScreenDef,
  () => 'назначенные',
);
const menu = PagePresenter.for(MainMenuScreenDef, () => 'меню');
const assigned = PageNotePresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `Назначена: ${title}`,
);
const completed = PageNotePresenter.for(
  TaskCompletedNotificationDef,
  ({ title }) => `Выполнена: ${title}`,
);

/** Представления всех экранов и уведомлений модуля `todo`. */
const todoAll = [list, card, assignedTasks, menu, assigned, completed];

/** Текст броска вызова; не бросил — `undefined`. */
const failure = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
};

describe('PageViews — реестр модуля', () => {
  test('экран и уведомление модуля по Def — то же представление', () => {
    const views = PageViews.of(TodoUiModuleDef, todoAll);

    expect(views.module).toBe(TodoUiModuleDef);
    expect(views.screen(TaskListScreenDef)).toBe(list);
    expect(views.screen(TaskCardScreenDef)).toBe(card);
    expect(views.notification(TaskAssignedNotificationDef)).toBe(assigned);
    expect(views.notification(TaskCompletedNotificationDef)).toBe(completed);
  });

  test('экран и уведомление модуля без представления — отказ UI-06 с именами реестра, модуля и Def', () => {
    expect(
      failure(() => PageViews.of(TodoUiModuleDef, [list, card, assigned])),
    ).toBe(
      'UI-06: PageViews модуля todo: нет представления для assignedTasks, mainMenu, taskCompleted',
    );
  });

  test('поиск экрана вне модуля — бросок с именем экрана, без ID правила', () => {
    const views = PageViews.of(TodoUiModuleDef, todoAll);

    const message = failure(() => views.screen(UserCardScreenDef));

    expect(message).toContain('userCard');
    expect(message).not.toContain('UI-06');
  });
});

describe('PageNotePresenter', () => {
  test('text проверяет данные схемой уведомления и отдаёт текст', () => {
    expect(assigned.text({ title: 'Сыр' })).toBe('Назначена: Сыр');
  });

  test('данные не по схеме — бросок, не приведение', () => {
    expect(() => assigned.text({ title: 42 })).toThrow();
  });
});
