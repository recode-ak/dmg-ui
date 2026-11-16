import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { ListTasksUcDef } from 'dmg-core/testing/example';
import * as v from 'valibot';
import {
  exampleCodes,
  LIST_ID,
  LIST_START,
  TASK_A,
  TASK_B,
  TaskAssignedNotificationDef,
  TaskListScreenDef,
} from '../../testing/example';
import { TaskListScreenCode } from '../../testing/example/todo/task-list.code';
import { UiScene } from '../../testing/ui-arch';
import { testRenderContext } from '../../testing/ui-runtime-fixture';
import { ScreenDef } from '../manifest/screen-def';
import { CodeDefect } from '../screen/code-defect';
import { ScreenCode } from '../screen/screen-code';
import type { LoadContext } from '../screen/screen-code.types';
import { CodeLoader, CodeLoaders } from './code-loaders';
import type { ActionView } from './outcome.types';
import { ScreenPreview } from './screen-preview';

// Вид экрана и данные уведомления по именованному примеру Def — без портов,
// наблюдателя и `load` кода. Ошибка в примере — бросок `CodeDefect`
// с путями полей, без значений.

type List = typeof TaskListScreenDef;

/** Превью набора примера с его загрузчиками кода. */
const preview = (codes = exampleCodes()) =>
  new ScreenPreview({ set: codes.set, codes });

/** Бросок вызова (синхронный или отказ промиса); не бросил — `undefined`. */
const thrown = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
};

/** Код списка, который помнит вызовы `load`. */
class SpyList extends TaskListScreenCode {
  readonly loads: unknown[] = [];

  override async load(ctx: LoadContext<List>) {
    this.loads.push(ctx.params);
    return super.load(ctx);
  }
}

/** Экран со состоянием: пример без `state`, начальное — из данных кодом. */
const DraftScreenDef = ScreenDef.define({
  name: 'draft',
  label: 'Черновик',
  description: 'Экран с состоянием из данных.',
  reads: [ListTasksUcDef],
  data: v.object({ first: v.string() }),
  state: v.strictObject({ picked: v.array(v.string()) }),
  examples: {
    bare: {
      label: 'Без состояния',
      description: 'Пример задаёт только данные.',
      params: {},
      data: { first: 'Хлеб' },
    },
    badData: {
      label: 'Данные не по схеме',
      description: 'Поле first — не строка.',
      params: {},
      data: { first: 4242 },
    },
    badState: {
      label: 'Состояние не по схеме',
      description: 'Поле picked — не массив.',
      params: {},
      data: { first: 'Хлеб' },
      state: { picked: 'секрет-состояния' },
    },
  },
});

class DraftScreenCode extends ScreenCode<typeof DraftScreenDef> {
  override async load() {
    return ok({ first: 'из load' });
  }

  override initialState(data: { readonly first: string }) {
    return { picked: [data.first] };
  }
}

/** Набор с одним экраном `draft` и его код. */
const draftPreview = () => {
  const { set } = new UiScene({ screens: [DraftScreenDef] });
  const codes = CodeLoaders.of(set, [
    CodeLoader.screen(DraftScreenDef, async () => new DraftScreenCode()),
  ]);
  return new ScreenPreview({ set, codes });
};

describe('ScreenPreview.screen — вид по примеру', () => {
  test('пример full — вид ready: адрес, ревизия 0, данные и состояние примера', async () => {
    const view = await preview().screen(
      TaskListScreenDef,
      'full',
      testRenderContext,
    );

    expect(view).toMatchObject({
      screen: LIST_ID,
      address: LIST_START,
      revision: 0,
      status: 'ready',
      data: TaskListScreenDef.examples.full?.data,
      state: { selected: [TASK_A] },
      context: testRenderContext,
      primary: 'create',
    });
  });

  test('доступность и варианты полей — из кода экрана', async () => {
    const view = await preview().screen(
      TaskListScreenDef,
      'full',
      testRenderContext,
    );
    const action = (name: string) =>
      view.actions.find((item: ActionView) => item.name === name);

    expect(action('completeSelected')?.available).toBe(true);
    expect(action('next')?.available).toBe(true);
    expect(action('open')?.fields).toEqual([
      expect.objectContaining({
        name: 'taskId',
        choices: [
          { value: TASK_A, label: 'Хлеб' },
          { value: TASK_B, label: 'Молоко' },
        ],
      }),
    ]);
    expect(view.locals).toEqual([
      expect.objectContaining({ name: 'toggle', available: true }),
    ]);
  });

  test('пример без state — состояние из initialState кода по данным примера', async () => {
    const view = await draftPreview().screen(
      DraftScreenDef,
      'bare',
      testRenderContext,
    );

    expect(view.data).toEqual({ first: 'Хлеб' });
    expect(view.state).toEqual({ picked: ['Хлеб'] });
  });

  test('readOnly гасит действия с uc, действия без uc доступны', async () => {
    const view = await preview().screen(TaskListScreenDef, 'full', {
      ...testRenderContext,
      readOnly: true,
    });
    const available = Object.fromEntries(
      view.actions.map((action: ActionView) => [action.name, action.available]),
    );

    expect(available).toEqual({
      open: true,
      create: false,
      completeSelected: false,
      next: true,
      prev: false,
      close: true,
    });
  });

  test('порты и load кода не зовутся', async () => {
    const list = new SpyList();

    await preview(exampleCodes({ list })).screen(
      TaskListScreenDef,
      'empty',
      testRenderContext,
    );

    expect(list.loads).toEqual([]);
  });
});

describe('ScreenPreview.screen — ошибка в примере — бросок CodeDefect', () => {
  test('нет примера — бросок с именем примера', async () => {
    const error = await thrown(() =>
      preview().screen(TaskListScreenDef, 'missing', testRenderContext),
    );

    expect(error).toBeInstanceOf(CodeDefect);
    expect(String(error)).toContain('missing');
  });

  test('данные не по схеме — бросок с путём поля, без значения', async () => {
    const error = await thrown(() =>
      draftPreview().screen(DraftScreenDef, 'badData', testRenderContext),
    );

    expect(error).toBeInstanceOf(CodeDefect);
    expect(String(error)).toContain('first');
    expect(String(error)).not.toContain('4242');
  });

  test('состояние не по схеме — бросок с путём поля, без значения', async () => {
    const error = await thrown(() =>
      draftPreview().screen(DraftScreenDef, 'badState', testRenderContext),
    );

    expect(error).toBeInstanceOf(CodeDefect);
    expect(String(error)).toContain('picked');
    expect(String(error)).not.toContain('секрет-состояния');
  });
});

describe('ScreenPreview.notification — данные по примеру', () => {
  test('уведомление — id узла и данные примера', () => {
    expect(
      preview().notification(TaskAssignedNotificationDef, 'sample'),
    ).toEqual({
      notification: 'exampleUi/todo/taskAssigned',
      data: { title: 'Хлеб' },
    });
  });

  test('нет примера уведомления — бросок CodeDefect с именем примера', async () => {
    const error = await thrown(() =>
      preview().notification(TaskAssignedNotificationDef, 'missing'),
    );

    expect(error).toBeInstanceOf(CodeDefect);
    expect(String(error)).toContain('missing');
  });
});

describe('ScreenPreview — сборка', () => {
  test('загрузчики другого набора — бросок', () => {
    const { set } = new UiScene({ screens: [DraftScreenDef] });

    expect(() => new ScreenPreview({ set, codes: exampleCodes() })).toThrow();
  });
});
