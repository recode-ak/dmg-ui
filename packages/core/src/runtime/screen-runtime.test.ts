import { describe, expect, test } from 'bun:test';
import {
  CoreErrors,
  ErrorDef,
  ErrorText,
  err,
  ok,
  type Result,
} from 'dmg-core';
import {
  CreateTaskUcDef,
  ExampleAppDef,
  GetTaskUcDef,
  ListTasksUcDef,
  TaskErrors,
} from 'dmg-core/testing/example';
import * as v from 'valibot';
import {
  CARD_ID,
  exampleCodes,
  LIST_ID,
  LIST_START,
  TASK_A,
  type TaskListScreenDef,
} from '../../testing/example';
import { TaskListScreenCode } from '../../testing/example/todo/task-list.code';
import {
  RuntimeKit,
  requestTrace,
  TASKS,
} from '../../testing/ui-runtime-fixture';
import type { AddressRejection } from '../address/address-codec.types';
import { ScreenDef } from '../manifest/screen-def';
import { UiModuleDef } from '../manifest/ui-module-def';
import { UiSetDef } from '../manifest/ui-set-def';
import { ScreenCode } from '../screen/screen-code';
import type { LoadContext } from '../screen/screen-code.types';
import { CodeLoader, CodeLoaders } from './code-loaders';
import type { ScreenInstance } from './screen-instance';

// Открытие и восстановление экземпляра экрана: загрузка через порт, отказ
// загрузки, дефекты кода экрана, снимок и восстановление. Порты — заглушки
// `ui-runtime-fixture.ts` на учебном примере.

type ListLoad = LoadContext<typeof TaskListScreenDef>;

/** Исполнитель со своим кодом списка. */
const kitWith = (list: TaskListScreenCode) =>
  new RuntimeKit(exampleCodes({ list }));

/** Ответ `listTasks` — отказ с ошибкой `error`. */
const refuseList = (
  kit: RuntimeKit,
  error: Parameters<typeof ErrorDef.serialize>[0],
) => kit.ucs.answer(ListTasksUcDef, err(ErrorDef.serialize(error)));

/** Экземпляр из восстановления; отказ — падение теста (`expectOk` ждёт `code`). */
const restoredOf = (res: Result<ScreenInstance, AddressRejection>) => {
  if (!res.ok) throw new Error(`ожидалось восстановление: ${res.error.reason}`);
  return res.value;
};

const defectsOf = (kit: RuntimeKit) =>
  kit.observer.records.filter((entry) => entry.kind === 'defect');

/** Экран, объявивший command UC в `reads`, — нарушение правила графа. */
const CommandReadScreenDef = ScreenDef.define({
  name: 'commandRead',
  label: 'Чтение командой',
  description: 'Экран объявил command UC в reads — нарушение.',
  reads: [CreateTaskUcDef],
  data: v.object({}),
});

class CommandReadCode extends ScreenCode<typeof CommandReadScreenDef> {
  override async load({ read }: LoadContext<typeof CommandReadScreenDef>) {
    const created = await read(CreateTaskUcDef, { title: 'Хлеб' });
    return created.ok ? ok({}) : created;
  }
}

const CommandReadSetDef = UiSetDef.define({
  name: 'commandUi',
  label: 'Набор с нарушением',
  description: 'Экран читает command UC.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'todo',
      label: 'Задачи',
      description: 'Модуль с одним экраном.',
      screens: [CommandReadScreenDef],
      stories: [],
    }),
  ],
});

const commandReadCodes = () =>
  CodeLoaders.of(CommandReadSetDef, [
    CodeLoader.screen(CommandReadScreenDef, async () => new CommandReadCode()),
  ]);

/** Код списка, который читает необъявленный UC. */
class UndeclaredRead extends TaskListScreenCode {
  override async load(ctx: ListLoad) {
    // @ts-expect-error read принимает только UC из reads экрана
    await ctx.read(GetTaskUcDef, { taskId: TASK_A });
    return super.load(ctx);
  }
}

describe('ScreenRuntime.open', () => {
  test('данные по схеме, ревизия 1, статус ready', async () => {
    const instance = await new RuntimeKit().openList();

    expect(instance.view()).toMatchObject({
      screen: LIST_ID,
      address: LIST_START,
      revision: 1,
      status: 'ready',
      data: { tasks: [...TASKS], hasMore: false, hasPrev: false },
      state: { selected: [] },
    });
  });

  test('загрузка зовёт UC с модулем UC и requestId открытия, без node и trace', async () => {
    const kit = new RuntimeKit();

    await kit.openList();

    expect(kit.ucs.calls).toEqual([
      {
        module: 'todo',
        uc: 'listTasks',
        input: {},
        requestId: 'r-open',
      },
    ]);
  });

  test('запись opened — с node экрана, следом и ревизией', async () => {
    const kit = new RuntimeKit();

    await kit.openList();

    expect(kit.observer.records).toEqual([
      {
        kind: 'opened',
        node: LIST_ID,
        trace: requestTrace('r-open'),
        instance: expect.any(String),
        revision: 1,
      },
    ]);
  });
});

describe('ScreenRuntime.open — отказ загрузки', () => {
  test('отказ UC — статус refused, текст — главная строка ErrorText', async () => {
    const kit = new RuntimeKit();
    const denied = CoreErrors.ACCESS_DENIED.make({
      rule: 'isOwner',
      denyMessage: 'Список видит только владелец.',
    });
    refuseList(kit, denied);

    const instance = await kit.openList();

    expect(instance.view()).toMatchObject({
      status: 'refused',
      refusal: {
        code: 'ACCESS_DENIED',
        text: ErrorText.of(denied).summary,
        caught: false,
      },
    });
  });

  test('код отказа из catches экрана — caught: true', async () => {
    class TooMany extends TaskListScreenCode {
      override async load() {
        return TaskErrors.TOO_MANY_OPEN.err({ limit: 5 });
      }
    }

    const instance = await kitWith(new TooMany()).openList();

    expect(instance.view().refusal).toMatchObject({
      code: 'TASK_TOO_MANY_OPEN',
      caught: true,
    });
  });

  test('INPUT_VALIDATION с issues — только главная строка, без строк полей', async () => {
    const kit = new RuntimeKit();
    const invalid = CoreErrors.INPUT_VALIDATION.make({
      issues: [{ path: 'title', message: 'Название не по схеме' }],
    });
    refuseList(kit, invalid);

    const text = (await kit.openList()).view().refusal?.text;

    expect(text).toBe(ErrorText.of(invalid).summary);
    expect(text).not.toContain('Смещение');
  });
});

describe('ScreenRuntime.open — дефекты кода экрана', () => {
  test('read необъявленного UC — SERVER_INTERNAL и defect «не объявил UC»', async () => {
    const kit = kitWith(new UndeclaredRead());

    const view = (await kit.openList()).view();

    expect(view.refusal).toMatchObject({
      code: 'SERVER_INTERNAL',
      caught: false,
    });
    expect(kit.ucs.names()).not.toContain('getTask');
    expect(defectsOf(kit)).toEqual([
      expect.objectContaining({
        node: LIST_ID,
        text: expect.stringContaining('не объявил UC'),
      }),
    ]);
  });

  test('read command UC — defect, UC не вызван', async () => {
    const kit = new RuntimeKit(commandReadCodes(), CommandReadSetDef);

    const instance = await kit.runtime.open(
      CommandReadScreenDef.at({}),
      RuntimeKit.options(),
    );

    expect(instance.view().refusal?.code).toBe('SERVER_INTERNAL');
    expect(kit.ucs.names()).not.toContain('createTask');
    expect(defectsOf(kit)).toHaveLength(1);
  });

  test('данные загрузки не по схеме — SERVER_INTERNAL и defect', async () => {
    class BadData extends TaskListScreenCode {
      override async load() {
        return ok({
          tasks: [{ uuid: 'не uuid', title: 'Хлеб', status: 'open' as const }],
          hasMore: false,
          hasPrev: false,
        });
      }
    }
    const kit = kitWith(new BadData());

    const view = (await kit.openList()).view();

    expect(view.refusal).toMatchObject({
      code: 'SERVER_INTERNAL',
      caught: false,
    });
    expect(defectsOf(kit)).toHaveLength(1);
  });
});

describe('ScreenRuntime.restore', () => {
  test('круг snapshot → JSON → restore даёт тот же адрес и состояние', async () => {
    const kit = new RuntimeKit();
    const first = await kit.openList();
    await first.local({ name: 'toggle', input: { taskId: TASK_A } });
    const json = JSON.parse(JSON.stringify(first.snapshot()));

    const restored = restoredOf(
      await kit.runtime.restore(json, RuntimeKit.options()),
    );

    expect(restored.snapshot()).toMatchObject({
      address: first.snapshot().address,
      state: { selected: [TASK_A] },
    });
  });

  test('состояние не по схеме — начальное по данным', async () => {
    const json = {
      address: LIST_START,
      state: { selected: 'все' },
      revision: 1,
    };

    const restored = restoredOf(
      await new RuntimeKit().runtime.restore(json, RuntimeKit.options()),
    );

    expect(restored.view().state).toEqual({ selected: [] });
  });

  const broken: ReadonlyArray<readonly [AddressRejection['reason'], unknown]> =
    [
      ['malformed', 'не снимок'],
      [
        'unknownScreen',
        {
          address: { screen: 'exampleUi/todo/missing', params: {} },
          revision: 1,
        },
      ],
      [
        'invalidParams',
        { address: { screen: CARD_ID, params: { taskId: 42 } }, revision: 1 },
      ],
    ];

  for (const [reason, json] of broken) {
    test(`адрес снимка не восстановлен — отказ ${reason}, UC не вызван`, async () => {
      const kit = new RuntimeKit();

      const res = await kit.runtime.restore(json, RuntimeKit.options());

      expect(res.ok ? undefined : res.error.reason).toBe(reason);
      expect(kit.ucs.calls).toEqual([]);
    });
  }

  test('ревизия после restore — ревизия снимка + 1', async () => {
    const json = {
      address: LIST_START,
      state: { selected: [] },
      revision: 5,
    };

    const restored = restoredOf(
      await new RuntimeKit().runtime.restore(json, RuntimeKit.options()),
    );

    expect(restored.view().revision).toBe(6);
  });

  for (const revision of [1e300, -1, 1.5, undefined]) {
    test(`ревизия снимка ${revision} — отказ malformed, UC не вызван`, async () => {
      const kit = new RuntimeKit();
      const json = {
        address: LIST_START,
        revision,
      };

      const res = await kit.runtime.restore(json, RuntimeKit.options());

      expect(res.ok ? undefined : res.error.reason).toBe('malformed');
      expect(kit.ucs.calls).toEqual([]);
    });
  }
});

describe('ScreenRuntime — сборка и загрузчик', () => {
  test('загрузчики другого набора — бросок с именами наборов', () => {
    expect(() => new RuntimeKit(exampleCodes(), CommandReadSetDef)).toThrow(
      /exampleUi.*commandUi/,
    );
  });

  test('сбой загрузчика кода — open отклонён', async () => {
    const codes = CodeLoaders.of(CommandReadSetDef, [
      CodeLoader.screen(CommandReadScreenDef, async () => {
        throw new Error('нет сети');
      }),
    ]);
    const kit = new RuntimeKit(codes, CommandReadSetDef);

    const opening = kit.runtime.open(
      CommandReadScreenDef.at({}),
      RuntimeKit.options(),
    );

    await expect(opening).rejects.toThrow('нет сети');
  });
});
