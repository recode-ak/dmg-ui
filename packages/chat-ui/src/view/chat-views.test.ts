import { describe, expect, test } from 'bun:test';
import {
  AssignedTasksScreenDef,
  MainMenuScreenDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
  TodoUiModuleDef,
  todoChatViews,
  UserCardScreenDef,
  usersChatViews,
} from 'dmg-ui/example';
import { ChatViews } from './chat-views';
import { NotificationPresenter } from './notification-presenter';
import { ScreenPresenter } from './screen-presenter';

// Виды модулей — из реестров каналов: те же объекты, что отдаёт реестр.
const TaskListView = todoChatViews.screen(TaskListScreenDef);
const TaskCardView = todoChatViews.screen(TaskCardScreenDef);
const AssignedTasksView = todoChatViews.screen(AssignedTasksScreenDef);
const MainMenuView = todoChatViews.screen(MainMenuScreenDef);
const TaskAssignedView = todoChatViews.notification(
  TaskAssignedNotificationDef,
);
const TaskCompletedView = todoChatViews.notification(
  TaskCompletedNotificationDef,
);
const UserCardView = usersChatViews.screen(UserCardScreenDef);

// Реестр представлений одного UI-модуля в мессенджере: ключ — Def экрана и
// уведомления модуля; каждому — ровно одно представление, иначе отказ UI-06
// со всеми нарушениями. `over` — новый реестр того же модуля, где
// представления пакета мессенджера перекрывают базовые по Def. Проверки — по
// тождеству: реестр отдаёт тот объект, что ему дали.

/** Представления всех экранов и уведомлений модуля `todo`, кроме списка. */
const todoRest = [
  TaskCardView,
  AssignedTasksView,
  MainMenuView,
  TaskAssignedView,
  TaskCompletedView,
];

/** Полный реестр модуля `todo`. */
const todo = () => ChatViews.of(TodoUiModuleDef, [TaskListView, ...todoRest]);

/** Представления пакета мессенджера — слой перекрытия. */
const ownCard = ScreenPresenter.for(TaskCardScreenDef, () => 'Своя карточка');
const ownAssigned = NotificationPresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `Своё: ${title}`,
);

/** Текст броска вызова; не бросил — `undefined`. */
const failure = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return undefined;
};

describe('ChatViews — реестр модуля', () => {
  test('представление экрана и уведомления модуля по Def — тот же объект', () => {
    const views = todo();

    expect(views.module).toBe(TodoUiModuleDef);
    expect(views.screen(TaskListScreenDef)).toBe(TaskListView);
    expect(views.screen(TaskCardScreenDef)).toBe(TaskCardView);
    expect(views.notification(TaskAssignedNotificationDef)).toBe(
      TaskAssignedView,
    );
    expect(views.notification(TaskCompletedNotificationDef)).toBe(
      TaskCompletedView,
    );
  });

  test('экран и уведомление модуля без представления — отказ UI-06 с именами реестра, модуля и Def', () => {
    expect(
      failure(() =>
        ChatViews.of(TodoUiModuleDef, [
          TaskListView,
          TaskCardView,
          TaskAssignedView,
        ]),
      ),
    ).toBe(
      'UI-06: ChatViews модуля todo: нет представления для assignedTasks, mainMenu, taskCompleted',
    );
  });

  test('поиск экрана вне модуля — бросок с именем экрана, без ID правила', () => {
    const message = failure(() => todo().screen(UserCardScreenDef));

    expect(message).toContain('userCard');
    expect(message).not.toContain('UI-06');
  });
});

describe('ChatViews — перекрытие over', () => {
  test('over: представление мессенджера перекрывает базовое по Def, остальные — базовые; базовый реестр не изменился', () => {
    const base = todo();

    const layered = base.over([ownCard, ownAssigned]);

    expect(layered).not.toBe(base);
    expect(layered.module).toBe(TodoUiModuleDef);
    expect(layered.screen(TaskCardScreenDef)).toBe(ownCard);
    expect(layered.notification(TaskAssignedNotificationDef)).toBe(ownAssigned);
    expect(layered.screen(TaskListScreenDef)).toBe(TaskListView);
    expect(layered.notification(TaskCompletedNotificationDef)).toBe(
      TaskCompletedView,
    );
    expect(base.screen(TaskCardScreenDef)).toBe(TaskCardView);
    expect(base.notification(TaskAssignedNotificationDef)).toBe(
      TaskAssignedView,
    );
  });

  test('over: представление экрана соседнего модуля — отказ UI-06 «вне модуля»', () => {
    expect(failure(() => todo().over([ownCard, UserCardView]))).toBe(
      'UI-06: ChatViews модуля todo: userCard вне модуля',
    );
  });

  test('over: два представления одного Def в слое — отказ UI-06 «два для»', () => {
    const otherCard = ScreenPresenter.for(
      TaskCardScreenDef,
      () => 'Ещё карточка',
    );

    expect(failure(() => todo().over([ownCard, otherCard]))).toBe(
      'UI-06: ChatViews модуля todo: два для taskCard',
    );
  });
});
