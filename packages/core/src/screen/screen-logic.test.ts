import { describe, expect, spyOn, test } from 'bun:test';
import {
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
  TaskListScreenDef,
} from '../../testing/ui-fixture';
import {
  TaskCardScreenCode,
  TaskListScreenCode,
} from '../../testing/ui-fixture-code';
import type { DataOf } from '../manifest/screen-def';
import { ScreenCode } from './screen-code';
import { ScreenLogic } from './screen-logic';

// Чистая логика экрана без исполнителя: импорты — только manifest/, screen/
// и фикстура (критерий 7 spec).

const data: DataOf<typeof TaskListScreenDef> = {
  tasks: [
    { uuid: TASK_A, title: 'Хлеб', status: 'open' },
    { uuid: TASK_B, title: 'Молоко', status: 'done' },
  ],
  hasMore: false,
  marked: [TASK_B],
};

const logicOf = (code = new TaskListScreenCode()) =>
  new ScreenLogic(TaskListScreenDef, code);

describe('ScreenLogic.restoreState', () => {
  test('состояние по схеме — то же', () => {
    expect(logicOf().restoreState({ selected: [TASK_A] }, data)).toEqual({
      selected: [TASK_A],
    });
  });

  test('лишний ключ, не тот тип или нет состояния — initialState(data)', () => {
    const logic = logicOf();
    for (const raw of [
      { selected: [], extra: true },
      { selected: 'все' },
      undefined,
    ]) {
      expect(logic.restoreState(raw, data)).toEqual({ selected: [TASK_B] });
    }
  });

  test('экран без состояния — undefined, initialState не нужен', () => {
    const logic = new ScreenLogic(TaskCardScreenDef, new TaskCardScreenCode());
    expect(
      logic.restoreState(undefined, {
        uuid: TASK_A,
        title: 'Хлеб',
        status: 'open',
      }),
    ).toBeUndefined();
  });

  test('экран с состоянием без initialState — бросок с именем экрана', () => {
    class NoInitial extends ScreenCode<typeof TaskListScreenDef> {}

    expect(() =>
      new ScreenLogic(TaskListScreenDef, new NoInitial()).restoreState(
        undefined,
        data,
      ),
    ).toThrow('taskList');
  });
});

describe('ScreenLogic.applyLocal', () => {
  test('toggle добавляет задачу в выбор', () => {
    const res = logicOf().applyLocal(
      'toggle',
      { taskId: TASK_A },
      { selected: [] },
      data,
    );

    expect(res).toEqual({ ok: true, value: { selected: [TASK_A] } });
  });

  test('вход не по схеме — отказ, код экрана не вызван', () => {
    const code = new TaskListScreenCode();
    const toggle = spyOn(code.locals, 'toggle');

    const res = logicOf(code).applyLocal(
      'toggle',
      { taskId: 42 },
      { selected: [] },
      data,
    );

    expect(res.ok).toBe(false);
    expect(toggle).not.toHaveBeenCalled();
  });

  test('код вернул состояние не по схеме — бросок', () => {
    class BrokenCode extends TaskListScreenCode {
      override readonly locals = {
        toggle: () => ({ selected: [], extra: true }),
      };
    }

    expect(() =>
      logicOf(new BrokenCode()).applyLocal(
        'toggle',
        { taskId: TASK_A },
        { selected: [] },
        data,
      ),
    ).toThrow('toggle');
  });
});

describe('ScreenLogic.available', () => {
  test('по умолчанию действие доступно', () => {
    expect(logicOf().available('create', data, { selected: [] })).toBe(true);
  });

  test('недоступно по данным: дальше списка нет', () => {
    expect(logicOf().available('next', data, { selected: [] })).toBe(false);
  });

  test('недоступно по состоянию: выбор пуст', () => {
    expect(
      logicOf().available('completeSelected', data, { selected: [] }),
    ).toBe(false);
  });
});

describe('ScreenLogic.fields и checkInput', () => {
  test('варианты поля — из данных, подпись — из схемы', () => {
    expect(logicOf().fields('open', data, { selected: [] })).toEqual([
      {
        name: 'taskId',
        label: 'Идентификатор задачи',
        optional: false,
        choices: [
          { value: TASK_A, label: 'Хлеб' },
          { value: TASK_B, label: 'Молоко' },
        ],
      },
    ]);
  });

  test('начальное значение поля — из defaults кода', () => {
    expect(logicOf().fields('create', data, { selected: [] })).toEqual([
      {
        name: 'title',
        label: 'Название задачи',
        optional: false,
        initial: 'Новая задача',
      },
    ]);
  });

  test('defaults не по схеме поля — бросок с именем действия', () => {
    class BrokenDefaults extends TaskListScreenCode {
      override defaults() {
        return { title: '' };
      }
    }

    expect(() =>
      logicOf(new BrokenDefaults()).fields('create', data, { selected: [] }),
    ).toThrow('create');
  });

  test('checkInput проверяет вход по схеме своего действия', () => {
    expect(logicOf().checkInput('create', { title: 'Хлеб' })).toEqual({
      ok: true,
      value: { title: 'Хлеб' },
    });
  });
});
