import { describe, expect, test } from 'bun:test';
import { toJsonSchema } from 'dmg-core';
import * as v from 'valibot';
import { TaskCardScreenDef, TaskListScreenDef } from '../../testing/ui-fixture';
import { type AnyScreenDef, ScreenDef } from './screen-def';

const list = TaskListScreenDef;
const json = (schema: v.GenericSchema) => toJsonSchema(schema);

describe('ScreenDef — форма', () => {
  test('нормализованная форма: схемы — JSON Schema, ссылки — именами', () => {
    expect(list.normalize()).toEqual({
      dmg: 'screen',
      name: 'taskList',
      label: 'Мои задачи',
      description: 'Список задач вызывающего с выбором для выполнения.',
      visible: false,
      params: json(list.params),
      reads: ['listTasks'],
      data: json(list.data),
      state: json(list.state!),
      actions: [
        {
          name: 'open',
          label: 'Открыть задачу',
          description: 'Карточка выбранной задачи.',
          visible: false,
          input: json(list.actions.open.input!),
          uc: undefined,
          to: ['taskCard'],
          confirm: undefined,
        },
        {
          name: 'create',
          label: 'Создать задачу',
          description: 'Новая задача в списке.',
          visible: true,
          input: json(list.actions.create.input!),
          uc: 'createTask',
          to: [],
          confirm: undefined,
        },
        {
          name: 'completeSelected',
          label: 'Выполнить выбранные',
          description: 'Отмечает выбранные задачи выполненными.',
          visible: false,
          input: undefined,
          uc: 'completeTask',
          to: [],
          confirm: {
            label: 'Выполнить выбранные задачи?',
            description: 'Выполненную задачу нельзя вернуть в работу.',
          },
        },
        {
          name: 'next',
          label: 'Дальше',
          description: 'Следующая часть списка.',
          visible: false,
          input: undefined,
          uc: undefined,
          to: [],
          confirm: undefined,
        },
      ],
      locals: [
        {
          name: 'toggle',
          label: 'Отметить задачу',
          description: 'Добавляет задачу в выбор или убирает из него.',
          input: json(list.locals.toggle.input!),
        },
      ],
      primary: 'create',
      exits: [
        {
          name: 'created',
          label: 'Задача создана',
          description: 'Создание задачи завершило сторис.',
          data: json(list.exits.created.data!),
        },
        {
          name: 'closed',
          label: 'Список закрыт',
          description: 'Пользователь закрыл список.',
          data: undefined,
        },
      ],
      refresh: [
        {
          event: 'todo.task.created',
          params: {},
          subject: 'ownerId',
          any: false,
        },
        {
          event: 'todo.task.archived',
          params: {},
          subject: undefined,
          any: true,
        },
      ],
      catches: ['TASK_TOO_MANY_OPEN'],
      examples: ['empty', 'full'],
    });
  });

  test('без необязательных полей: пустые параметры, без состояния, пустые списки', () => {
    const about = ScreenDef.define({
      name: 'about',
      label: 'О программе',
      description: 'Справка без действий.',
      reads: [],
      data: v.object({}),
    });

    expect(about.normalize()).toEqual({
      dmg: 'screen',
      name: 'about',
      label: 'О программе',
      description: 'Справка без действий.',
      visible: false,
      params: json(v.strictObject({})),
      reads: [],
      data: json(v.object({})),
      state: undefined,
      actions: [],
      locals: [],
      primary: undefined,
      exits: [],
      refresh: [],
      catches: [],
      examples: [],
    });
  });

  test('взаимные ссылки двух экранов раскрываются через thunk', () => {
    expect(list.actions.open.targets()).toEqual([TaskCardScreenDef]);
    expect(TaskCardScreenDef.actions.back.targets()[0]).toBe(list);
    expect(TaskCardScreenDef.normalize().actions[0]?.to).toEqual(['taskList']);
  });

  test('schemas() перечисляет параметры, данные, состояние, входы и данные выходов', () => {
    expect(list.schemas().map(([name]) => name)).toEqual([
      'params',
      'data',
      'state',
      'action.open.input',
      'action.create.input',
      'local.toggle.input',
      'exit.created.data',
    ]);
  });
});

describe('ScreenDef — типы и адрес', () => {
  test('действия и выходы — по именам спеки', () => {
    expect(list.actions.create.name).toBe('create');
    expect(list.exits.created.name).toBe('created');
    // @ts-expect-error — действия missing в спеке нет (TST-10)
    expect(list.actions.missing).toBeUndefined();
    // @ts-expect-error — выхода missing в спеке нет (TST-10)
    expect(list.exits.missing).toBeUndefined();
  });

  test('конкретный экран присваивается AnyScreenDef (без at)', () => {
    const asAny: AnyScreenDef = list;
    expect(asAny.name).toBe('taskList');
  });

  test('at() строит адрес на свой Def с выходом схемы параметров', () => {
    const address = list.at({ index: 2 });

    expect(address.screen).toBe(list);
    expect(address.params).toEqual({ index: 2 });
  });

  test('at() с параметрами не по схеме — бросок с именем экрана', () => {
    expect(() => list.at({ index: -1 })).toThrow('taskList');
  });

  test('at() с параметрами не того типа — ошибка типа', () => {
    // @ts-expect-error — index не строка (TST-10)
    expect(() => list.at({ index: 'один' })).toThrow('taskList');
  });
});
