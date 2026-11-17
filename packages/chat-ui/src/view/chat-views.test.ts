import { describe, expect, test } from 'bun:test';
import { ScreenDef, UiIds } from 'dmg-ui';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import * as v from 'valibot';
import { ChatViews } from './chat-views';
import { NotificationPresenter } from './notification-presenter';
import { ScreenPresenter } from './screen-presenter';

// Реестр представлений одного приложения мессенджера на учебном наборе:
// общий слой и перекрытие пакета мессенджера (`over`) — новый реестр, где
// представления мессенджера заменяют общие по `id`. Проверки — по
// тождеству представлений: реестр отдаёт тот объект, что ему дали.

const ids = new UiIds(ExampleUiSetDef);
const LIST = ids.screen(TaskListScreenDef);
const CARD = ids.screen(TaskCardScreenDef);
const ASSIGNED_TASKS = ids.screen(AssignedTasksScreenDef);
const ASSIGNED = ids.notification(TaskAssignedNotificationDef);
const COMPLETED = ids.notification(TaskCompletedNotificationDef);

/** Экран вне учебного набора. */
const StrayScreenDef = ScreenDef.define({
  name: 'stray',
  label: 'Чужой',
  description: 'Экран вне учебного набора.',
  reads: [],
  data: v.object({}),
});

const list = ScreenPresenter.for(TaskListScreenDef, () => 'Общий список');
const card = ScreenPresenter.for(TaskCardScreenDef, () => 'Общая карточка');
const assigned = NotificationPresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `Назначена: ${title}`,
);

/** Общий слой: список, карточка и одно уведомление. */
const common = () => ChatViews.of(ExampleUiSetDef, [list, card, assigned]);

/** Представления пакета мессенджера. */
const ownCard = ScreenPresenter.for(TaskCardScreenDef, () => 'Своя карточка');
const ownAssignedTasks = ScreenPresenter.for(
  AssignedTasksScreenDef,
  () => 'Свои назначенные',
);
const ownAssigned = NotificationPresenter.for(
  TaskAssignedNotificationDef,
  ({ title }) => `Своё: ${title}`,
);

describe('ChatViews', () => {
  test('представление экрана и уведомления по id; нет — бросок с id', () => {
    const views = common();

    expect(views.set).toBe(ExampleUiSetDef);
    expect(views.screen(LIST)).toBe(list);
    expect(views.screen(CARD)).toBe(card);
    expect(views.notification(ASSIGNED)).toBe(assigned);
    expect(() => views.screen(ASSIGNED_TASKS)).toThrow(ASSIGNED_TASKS);
    expect(() => views.notification(COMPLETED)).toThrow(COMPLETED);
  });

  test('Def вне набора или два представления одного Def в слое — бросок', () => {
    const stray = ScreenPresenter.for(StrayScreenDef, () => 'Чужой');
    const twice = ScreenPresenter.for(TaskListScreenDef, () => 'Второй список');
    const twiceNote = NotificationPresenter.for(
      TaskAssignedNotificationDef,
      () => 'Второе уведомление',
    );

    expect(() => ChatViews.of(ExampleUiSetDef, [list, stray])).toThrow('stray');
    expect(() => ChatViews.of(ExampleUiSetDef, [list, twice])).toThrow(LIST);
    expect(() => ChatViews.of(ExampleUiSetDef, [assigned, twiceNote])).toThrow(
      ASSIGNED,
    );
  });

  test('over: представление мессенджера перекрывает общее по id, остальные общие; прежний реестр не изменился', () => {
    const views = common();

    const layered = views.over([ownCard, ownAssignedTasks, ownAssigned]);

    expect(layered).not.toBe(views);
    expect(layered.set).toBe(ExampleUiSetDef);
    expect(layered.screen(CARD)).toBe(ownCard);
    expect(layered.screen(ASSIGNED_TASKS)).toBe(ownAssignedTasks);
    expect(layered.notification(ASSIGNED)).toBe(ownAssigned);
    expect(layered.screen(LIST)).toBe(list);
    expect(views.screen(CARD)).toBe(card);
    expect(views.notification(ASSIGNED)).toBe(assigned);
    expect(() => views.screen(ASSIGNED_TASKS)).toThrow(ASSIGNED_TASKS);
  });

  test('over: Def вне набора или два в слое — бросок', () => {
    const views = common();
    const stray = ScreenPresenter.for(StrayScreenDef, () => 'Чужой');
    const otherCard = ScreenPresenter.for(
      TaskCardScreenDef,
      () => 'Ещё карточка',
    );
    const otherAssigned = NotificationPresenter.for(
      TaskAssignedNotificationDef,
      () => 'Ещё уведомление',
    );

    expect(() => views.over([ownCard, stray])).toThrow('stray');
    expect(() => views.over([ownCard, otherCard])).toThrow(CARD);
    expect(() => views.over([ownAssigned, otherAssigned])).toThrow(ASSIGNED);
    expect(views.screen(CARD)).toBe(card);
  });

  test('presented — id общих и перекрытых без повторов', () => {
    const views = common();

    const layered = views.over([ownCard, ownAssignedTasks]);

    expect([...views.presented()].sort()).toEqual(
      [LIST, CARD, ASSIGNED].sort(),
    );
    expect([...layered.presented()].sort()).toEqual(
      [LIST, CARD, ASSIGNED_TASKS, ASSIGNED].sort(),
    );
  });
});
