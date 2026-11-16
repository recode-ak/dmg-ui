import { describe, expect, test } from 'bun:test';
import { ExampleAppDef } from 'dmg-core/testing/example';
import * as v from 'valibot';
import {
  ExampleUiSetDef,
  TaskCardScreenDef,
  TaskListScreenDef,
} from '../../testing/ui-fixture';
import { ScreenDef } from '../manifest/screen-def';
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
});
