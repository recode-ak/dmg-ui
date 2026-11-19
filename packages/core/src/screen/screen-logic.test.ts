import { describe, expect, spyOn, test } from 'bun:test';
import type { ExampleUser } from 'dmg-core/testing/example';
import * as v from 'valibot';
import {
  LIST_START,
  OWNER,
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
  TaskListScreenDef,
} from '../../testing/example';
import { TaskCardScreenCode } from '../../testing/example/todo/task-card.code';
import { TaskListScreenCode } from '../../testing/example/todo/task-list.code';
import { taskState } from '../../testing/task-state';
import type { DataOf } from '../manifest/screen-def';
import { Availability } from './availability';
import { CodeDefect } from './code-defect';
import { ScreenCode } from './screen-code';
import { ScreenLogic } from './screen-logic';

// Чистая логика экрана: под тестом `ScreenLogic` и код экрана примера;
// исполнитель, сервер и канал не участвуют (вход примера их не грузит).

const BREAD = taskState({ uuid: TASK_A, title: 'Хлеб', status: 'open' });
const MILK = taskState({ uuid: TASK_B, title: 'Молоко', status: 'done' });

const data: DataOf<typeof TaskListScreenDef> = {
  tasks: [BREAD, MILK],
  owned: [BREAD, MILK],
  hasMore: false,
  hasPrev: false,
};

const SUBJECT = { uuid: OWNER, hasRole: () => false };
/** Параметры адреса списка — выход схемы `params` экрана. */
const PARAMS = v.parse(TaskListScreenDef.params, LIST_START.params);
const PLACE = { locale: 'ru-RU', timeZone: 'Asia/Oral' };

/** Вход функции доступности: параметры, данные, состояние, субъект и контекст. */
const ctxOf = (
  listData: DataOf<typeof TaskListScreenDef> = data,
  selected: string[] = [],
  subject: typeof SUBJECT | undefined = SUBJECT,
) => ({
  params: PARAMS,
  data: listData,
  state: { selected },
  subject,
  context: { ...PLACE, subject },
});

const logicOf = (
  code: ScreenCode<
    typeof TaskListScreenDef,
    ExampleUser
  > = new TaskListScreenCode(),
) => new ScreenLogic(TaskListScreenDef, code);

/**
 * Начальное состояние из данных (в примере его нет): выполненные
 * задачи из данных — выбраны.
 */
class DoneSelectedCode extends ScreenCode<typeof TaskListScreenDef> {
  override readonly locals = new TaskListScreenCode().locals;

  override initialState(listData: DataOf<typeof TaskListScreenDef>) {
    return {
      selected: listData.tasks
        .filter((task) => task.status === 'done')
        .map((task) => task.uuid),
    };
  }
}

/** Код списка без `availability`, `choices` и `defaults` — для умолчаний. */
class BareListCode extends ScreenCode<typeof TaskListScreenDef> {
  override readonly locals = {
    toggle: (state: { selected: string[] }) => state,
  };

  override initialState() {
    return { selected: [] };
  }
}

describe('ScreenLogic — проверка кода при создании', () => {
  test('экран с состоянием без initialState — бросок с именем экрана', () => {
    class NoInitial extends ScreenCode<typeof TaskListScreenDef> {
      override readonly locals = new TaskListScreenCode().locals;
    }

    expect(() => new ScreenLogic(TaskListScreenDef, new NoInitial())).toThrow(
      'taskList',
    );
  });

  test('локальное действие без функции в коде — бросок с экраном и действием', () => {
    class NoLocals extends ScreenCode<typeof TaskListScreenDef> {
      override initialState() {
        return { selected: [] };
      }
    }

    expect(() => new ScreenLogic(TaskListScreenDef, new NoLocals())).toThrow(
      /taskList.*toggle/,
    );
  });
});

describe('ScreenLogic.restoreState', () => {
  test('состояние по схеме — то же', () => {
    expect(logicOf().restoreState({ selected: [TASK_A] }, data)).toEqual({
      selected: [TASK_A],
    });
  });

  test('лишний ключ, не тот тип или нет состояния — initialState(data)', () => {
    const logic = logicOf(new DoneSelectedCode());
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
    expect(logic.restoreState(undefined, BREAD)).toBeUndefined();
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

const DISABLED = {
  kind: 'disabled',
  text: expect.stringMatching(/\S/),
} as const;

describe('ScreenLogic.availability', () => {
  test('нет записи в availability кода — действие доступно', () => {
    const logic = new ScreenLogic(TaskListScreenDef, new BareListCode());

    expect(logic.availability('next', ctxOf())).toEqual({ kind: 'available' });
  });

  test('неизвестное имя — CodeDefect с именем', () => {
    const run = () =>
      // @ts-expect-error имя не из actions и locals экрана
      logicOf().availability('missing', ctxOf());

    expect(run).toThrow(CodeDefect);
    expect(run).toThrow('missing');
  });

  test('локальное действие: отметка недоступна, пока задач нет', () => {
    const empty = { ...data, tasks: [], owned: [] };

    expect(logicOf().availability('toggle', ctxOf())).toEqual({
      kind: 'available',
    });
    expect(logicOf().availability('toggle', ctxOf(empty))).toEqual(DISABLED);
  });

  test('ctx несёт параметры, данные, состояние, субъекта и место', () => {
    const seen: unknown[] = [];
    class Recording extends BareListCode {
      override readonly availability = {
        next: (ctx: unknown) => {
          seen.push(ctx);
          return Availability.yes();
        },
      };
    }
    const ctx = ctxOf(data, [TASK_A]);

    new ScreenLogic(TaskListScreenDef, new Recording()).availability(
      'next',
      ctx,
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      params: LIST_START.params,
      data,
      state: { selected: [TASK_A] },
      subject: SUBJECT,
      context: PLACE,
    });
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

  test('без choices и defaults в коде — у полей нет вариантов и начальных значений', () => {
    const logic = new ScreenLogic(TaskListScreenDef, new BareListCode());
    expect(logic.fields('open', data, { selected: [] })).toEqual([
      { name: 'taskId', label: 'Идентификатор задачи', optional: false },
    ]);
    expect(logic.fields('create', data, { selected: [] })).toEqual([
      { name: 'title', label: 'Название задачи', optional: false },
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

  test('поля локального действия: подпись из схемы, варианты — из кода', () => {
    expect(logicOf().fields('toggle', data, { selected: [] })).toEqual([
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

  test('checkInput проверяет вход по схеме своего действия', () => {
    expect(logicOf().checkInput('create', { title: 'Хлеб' })).toEqual({
      ok: true,
      value: { title: 'Хлеб' },
    });
  });
});
