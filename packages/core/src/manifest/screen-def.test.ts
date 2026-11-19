import { describe, expect, test } from 'bun:test';
import { toJsonSchema } from 'dmg-core';
import { TaskEvents } from 'dmg-core/testing/example';
import * as v from 'valibot';
import {
  TASK_A,
  TaskCardScreenDef,
  TaskListScreenDef,
} from '../../testing/example';
import { UiScene } from '../../testing/ui-arch';
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
      hint: list.hint,
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
          description: 'Отмечает выбранные открытые задачи выполненными.',
          visible: false,
          input: undefined,
          uc: 'completeTasks',
          to: [],
          confirm: {
            label: 'Выполнить выбранные задачи?',
            description: 'Выполненную задачу нельзя вернуть в работу.',
          },
        },
        {
          name: 'jumpTo',
          label: 'К части',
          description: 'Переход к части списка по её номеру.',
          hint: 'Укажите номер части списка, чтобы не листать по одной',
          visible: false,
          input: json(list.actions.jumpTo.input!),
          uc: undefined,
          to: [],
          confirm: undefined,
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
        {
          name: 'prev',
          label: list.actions.prev.label,
          description: 'Предыдущая часть списка.',
          visible: false,
          input: undefined,
          uc: undefined,
          to: [],
          confirm: undefined,
        },
        {
          name: 'close',
          label: 'Закрыть',
          description: 'Закончить работу со списком.',
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
          event: 'todo.task.completed',
          params: {},
          subject: 'ownerId',
          any: false,
        },
      ],
      catches: ['TASK_TOO_MANY_OPEN'],
      examples: ['empty', 'full'],
    });
  });

  test('запись any — в форме any: true без субъекта', () => {
    // В примере записи `any` нет: форма — на локальном Def.
    const everyone = ScreenDef.define({
      name: 'everyone',
      label: 'Всем',
      description: 'Перечитывается у всех по архивации задачи.',
      reads: [],
      data: v.object({}),
      refresh: [{ event: TaskEvents.archived, any: true }],
    });

    expect(everyone.normalize().refresh).toEqual([
      {
        event: 'todo.task.archived',
        params: {},
        subject: undefined,
        any: true,
      },
    ]);
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
      'action.jumpTo.input',
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

  // `at()` — на карточке: имя параметра списка сканер слов канала в `src` не пускает.
  test('at() строит адрес на свой Def с выходом схемы параметров', () => {
    const address = TaskCardScreenDef.at({ taskId: TASK_A });

    expect(address.screen).toBe(TaskCardScreenDef);
    expect(address.params).toEqual({ taskId: TASK_A });
  });

  test('at() с параметрами не по схеме — бросок с именем экрана', () => {
    expect(() => TaskCardScreenDef.at({ taskId: 'не uuid' })).toThrow(
      'taskCard',
    );
  });

  test('at() с параметрами не того типа — ошибка типа', () => {
    // @ts-expect-error — taskId не число (TST-10)
    expect(() => TaskCardScreenDef.at({ taskId: 42 })).toThrow('taskCard');
  });
});

describe('ScreenDef — подсказка', () => {
  const hinted = ScreenDef.define({
    name: 'hinted',
    label: 'С подсказками',
    description: 'Экран с подсказкой у себя, действия и локального действия.',
    reads: [],
    data: v.object({}),
    hint: 'Подсказка экрана',
    actions: {
      go: {
        label: 'Вперёд',
        description: 'Переход.',
        hint: 'Подсказка действия',
      },
      stop: { label: 'Стоп', description: 'Без подсказки.' },
    },
    locals: {
      pick: {
        label: 'Выбрать',
        description: 'Локальное.',
        hint: 'Подсказка локального',
      },
      plain: { label: 'Простое', description: 'Без подсказки.' },
    },
  });

  test('hint экрана, действия и локального — свойства Def', () => {
    expect(hinted.hint).toBe('Подсказка экрана');
    expect(hinted.actions.go.hint).toBe('Подсказка действия');
    expect(hinted.locals.pick.hint).toBe('Подсказка локального');
  });

  test('нет подсказки — свойство hint не задано', () => {
    expect(hinted.actions.stop.hint).toBeUndefined();
    expect(hinted.locals.plain.hint).toBeUndefined();
    expect(UiScene.screen('plain').hint).toBeUndefined();
  });

  test('normalize кладёт hint экрана, действия и локального', () => {
    const normalized = hinted.normalize();

    expect(normalized.hint).toBe('Подсказка экрана');
    expect(normalized.actions.find((a) => a.name === 'go')?.hint).toBe(
      'Подсказка действия',
    );
    expect(normalized.locals.find((l) => l.name === 'pick')?.hint).toBe(
      'Подсказка локального',
    );
  });

  test('normalize без подсказки — ключа hint нет (экран, действие, локальное)', () => {
    const normalized = hinted.normalize();

    expect(
      normalized.actions.find((a) => a.name === 'stop'),
    ).not.toHaveProperty('hint');
    expect(
      normalized.locals.find((l) => l.name === 'plain'),
    ).not.toHaveProperty('hint');
    expect(UiScene.screen('plain').normalize()).not.toHaveProperty('hint');
  });

  test('учебный набор: подсказки у экрана taskList и действия jumpTo', () => {
    const normalized = list.normalize();

    expect(normalized.hint).toBeString();
    expect(normalized.hint).not.toBe('');
    expect(
      normalized.actions.find((a) => a.name === 'jumpTo')?.hint,
    ).toBeString();
  });

  test('jumpTo — действие списка без UC, с входом part', () => {
    const jumpTo = list.normalize().actions.find((a) => a.name === 'jumpTo');

    expect(jumpTo).toMatchObject({
      name: 'jumpTo',
      uc: undefined,
      to: [],
      input: json(list.actions.jumpTo.input!),
    });
  });
});
