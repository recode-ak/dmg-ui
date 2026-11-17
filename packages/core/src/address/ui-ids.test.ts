import { describe, expect, test } from 'bun:test';
import { ExampleAppDef, TaskEvents } from 'dmg-core/testing/example';
import * as v from 'valibot';
import {
  ExampleUiSetDef,
  FinishTasksStoryDef,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  TaskListScreenDef,
} from '../../testing/example';
import { ExampleStubAppDef } from '../../testing/ui-app-fixture';
import { NotificationDef } from '../manifest/notification-def';
import { ScreenDef } from '../manifest/screen-def';
import { StoryDef } from '../manifest/story-def';
import { UiModuleDef } from '../manifest/ui-module-def';
import { UiSetDef } from '../manifest/ui-set-def';
import { UiIds } from './ui-ids';

const ids = new UiIds(ExampleUiSetDef);

describe('UiIds', () => {
  test('id экрана — набор/модуль/экран', () => {
    expect(ids.screen(TaskCardScreenDef)).toBe('exampleUi/todo/taskCard');
  });

  test('findScreen по id — тот же Def, чужой id — undefined', () => {
    expect(ids.findScreen('exampleUi/todo/taskList')).toBe(TaskListScreenDef);
    expect(ids.findScreen('exampleUi/todo/missing')).toBeUndefined();
  });

  test('findNotification по id — тот же Def; чужой id, id экрана — undefined', () => {
    expect(ids.findNotification('exampleUi/todo/taskAssigned')).toBe(
      TaskAssignedNotificationDef,
    );
    expect(ids.findNotification('exampleUi/todo/missing')).toBeUndefined();
    expect(ids.findNotification('exampleUi/todo/taskList')).toBeUndefined();
  });

  test('два экрана с одним id в наборе — бросок с этим id', () => {
    const twin = ScreenDef.define({
      name: 'taskList',
      label: 'Двойник',
      description: 'Экран с тем же именем.',
      reads: [],
      data: v.object({}),
    });
    const set = UiSetDef.define({
      name: 'twins',
      label: 'Повтор',
      description: 'Набор с повтором id экрана.',
      app: ExampleAppDef,
      modules: [
        UiModuleDef.define({
          name: 'todo',
          label: 'Задачи',
          description: 'Модуль с двумя экранами taskList.',
          screens: [TaskListScreenDef, twin],
          stories: [],
        }),
      ],
    });

    expect(() => new UiIds(set)).toThrow('twins/todo/taskList');
  });

  test('один экран в двух модулях набора — бросок с именем экрана', () => {
    const module = (name: string) =>
      UiModuleDef.define({
        name,
        label: 'Модуль',
        description: 'Модуль с общим экраном.',
        screens: [TaskCardScreenDef],
        stories: [],
      });
    const set = UiSetDef.define({
      name: 'shared',
      label: 'Общий экран',
      description: 'Один Def экрана в двух модулях.',
      app: ExampleAppDef,
      modules: [module('first'), module('second')],
    });

    expect(() => new UiIds(set)).toThrow('taskCard');
  });

  test('id набора — его имя, модуля — набор/модуль', () => {
    expect(ids.set()).toBe('exampleUi');
    expect(ids.module(ExampleUiSetDef.modules[0]!)).toBe('exampleUi/todo');
  });

  test('id сторис и уведомления — набор/модуль/имя', () => {
    expect(ids.story(FinishTasksStoryDef)).toBe('exampleUi/todo/finishTasks');
    expect(ids.notification(TaskAssignedNotificationDef)).toBe(
      'exampleUi/todo/taskAssigned',
    );
  });

  test('id действия — id экрана и имя действия', () => {
    expect(ids.action(TaskListScreenDef, 'open')).toBe(
      'exampleUi/todo/taskList/open',
    );
  });

  test('id приложения UI — его имя, без набора', () => {
    expect(ids.app(ExampleStubAppDef)).toBe('exampleStub');
  });

  test('сторис с именем экрана в одном модуле — бросок с именем', () => {
    const twin = StoryDef.define({
      name: 'taskCard',
      label: 'Двойник',
      description: 'Сторис с именем экрана модуля.',
      callers: ['user'],
      goal: 'чтобы проверить повтор',
      start: TaskCardScreenDef,
      screens: [TaskCardScreenDef],
      outcomes: {},
    });
    const set = UiSetDef.define({
      name: 'clash',
      label: 'Повтор',
      description: 'Набор, где сторис повторяет имя экрана.',
      app: ExampleAppDef,
      modules: [
        UiModuleDef.define({
          name: 'todo',
          label: 'Задачи',
          description: 'Модуль со сторис и экраном одного имени.',
          screens: [TaskCardScreenDef],
          stories: [twin],
        }),
      ],
    });

    expect(() => new UiIds(set)).toThrow('clash/todo/taskCard');
  });

  test('уведомление с именем экрана в одном модуле — бросок с именем', () => {
    const twin = NotificationDef.define({
      name: 'taskCard',
      label: 'Двойник',
      description: 'Уведомление с именем экрана модуля.',
      event: TaskEvents.assigned,
      recipients: { from: 'payload', fields: ['assigneeId'] },
      reads: [],
      data: v.object({}),
    });
    const set = UiSetDef.define({
      name: 'clash',
      label: 'Повтор',
      description: 'Набор, где уведомление повторяет имя экрана.',
      app: ExampleAppDef,
      modules: [
        UiModuleDef.define({
          name: 'todo',
          label: 'Задачи',
          description: 'Модуль с уведомлением и экраном одного имени.',
          screens: [TaskCardScreenDef],
          stories: [],
          notifications: [twin],
        }),
      ],
    });

    expect(() => new UiIds(set)).toThrow('clash/todo/taskCard');
  });

  test('target экрана набора — его id', () => {
    expect(ids.target(TaskListScreenDef)).toBe('exampleUi/todo/taskList');
  });

  test('target экрана вне набора — внешний id без броска', () => {
    const stray = ScreenDef.define({
      name: 'stray',
      label: 'Чужой',
      description: 'Экран вне набора.',
      reads: [],
      data: v.object({}),
    });

    expect(ids.target(stray)).toBe('dmg-ui/orphan/screen/stray');
  });
});
