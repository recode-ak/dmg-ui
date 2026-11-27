import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import {
  exampleCodes,
  TASK_B,
  TaskCardScreenDef,
  TaskListScreenCode,
  type TaskListScreenDef,
} from 'dmg-ui/example';
import * as v from 'valibot';
import {
  RuntimeKit,
  requestTrace,
  testRenderContext,
} from '../../testing/ui-runtime.fixture';
import { ScreenDef } from '../manifest/screen-def';
import { ScreenCode } from '../screen/screen-code';
import type { ActionSteps } from '../screen/screen-code.types';
import { ScreenUnit } from './screen-unit';

// Действие строки (D-UI-129) — вид и исполнение: `taskList.open` примера и
// локальный экран с путём через необязательного родителя.

type List = typeof TaskListScreenDef;

const trace = requestTrace('r-row');
const NOT_LISTED = testUuid(9);

/** Код списка, который записывает вход шага `open`. */
class OpenSpy extends TaskListScreenCode {
  readonly inputs: unknown[] = [];
  override readonly actions: Partial<ActionSteps<List>> = {
    ...new TaskListScreenCode().actions,
    open: {
      done: ({ input }) => {
        this.inputs.push(input);
        return TaskCardScreenDef.at(input);
      },
    },
  };
}

describe('действие строки — вид экземпляра на примере taskList.open', () => {
  test('у действия без row ключа rows в виде нет', async () => {
    const view = (await new RuntimeKit().openList()).view();

    for (const name of ['create', 'next', 'close']) {
      const action = view.actions.find((item) => item.name === name);
      expect(action).toBeDefined();
      expect(action).not.toHaveProperty('rows');
    }
  });
});

describe('действие строки — исполнение', () => {
  test('вход — ключ показанной строки: done получает { taskId }, переход на экран ребёнка', async () => {
    const spy = new OpenSpy();
    const list = await new RuntimeKit(exampleCodes({ list: spy })).openList();

    const outcome = await list.act({
      action: 'open',
      input: { taskId: TASK_B },
      revision: 1,
      trace,
    });

    expect(spy.inputs).toEqual([{ taskId: TASK_B }]);
    expect(outcome).toMatchObject({
      kind: 'moved',
      address: { params: { taskId: TASK_B } },
    });
  });

  test('ключа нет среди строк данных — rejected «Строки нет в списке», done не вызван', async () => {
    const spy = new OpenSpy();
    const list = await new RuntimeKit(exampleCodes({ list: spy })).openList();

    const outcome = await list.act({
      action: 'open',
      input: { taskId: NOT_LISTED },
      revision: 1,
      trace,
    });

    expect(outcome).toEqual({
      kind: 'rejected',
      issues: [{ field: 'taskId', text: 'Строки нет в списке' }],
    });
    expect(spy.inputs).toEqual([]);
  });
});

/** Данные доски: список строк под необязательным родителем — путь `course.moduleRows`. */
const BoardScreenDef = ScreenDef.define({
  name: 'board',
  label: 'Доска',
  description: 'Строки списка по вложенному пути.',
  reads: [],
  data: v.object({
    course: v.optional(
      v.object({
        moduleRows: v.array(
          v.object({
            id: v.pipe(v.string(), v.description('Ключ строки')),
            title: v.pipe(v.string(), v.description('Подпись строки')),
          }),
        ),
      }),
    ),
  }),
  actions: {
    pick: {
      label: 'Выбрать модуль',
      description: 'Действие строки по вложенному пути.',
      input: v.object({
        moduleId: v.pipe(v.string(), v.description('Модуль')),
      }),
      row: { list: 'course.moduleRows', key: 'id', label: 'title' },
    },
  },
});

type Board = typeof BoardScreenDef;
type BoardData = v.InferOutput<Board['data']>;

class BoardCode extends ScreenCode<Board> {
  override readonly actions: Partial<ActionSteps<Board>> = {
    pick: { done: () => BoardScreenDef.at({}) },
  };

  override async load(): Promise<Result<BoardData, DomainError>> {
    return ok({});
  }
}

/** Вид действия `pick` для данных доски. */
const pickOf = (data: BoardData) => {
  const unit = new ScreenUnit(BoardScreenDef, new BoardCode());
  const { actions } = unit.present(
    { params: {}, data, state: undefined },
    testRenderContext,
  );
  const pick = actions.find((action) => action.name === 'pick');
  if (pick === undefined) throw new Error('действия pick в виде нет');
  return pick;
};

describe('действие строки — путь списка', () => {
  test('список по вложенному пути через необязательного родителя — строки по порядку', () => {
    const pick = pickOf({
      course: {
        moduleRows: [
          { id: 'm2', title: 'Синтаксис' },
          { id: 'm1', title: 'Функции' },
        ],
      },
    });

    expect(pick.rows).toEqual([
      { value: 'm2', label: 'Синтаксис' },
      { value: 'm1', label: 'Функции' },
    ]);
  });

  test('родителя пути в данных нет — rows: [], а не отказ и не бросок', () => {
    expect(pickOf({}).rows).toEqual([]);
  });
});
