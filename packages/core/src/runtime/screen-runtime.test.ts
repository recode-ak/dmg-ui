import { describe, expect, test } from 'bun:test';
import {
  CoreErrors,
  ErrorDef,
  ErrorText,
  err,
  ok,
  type Result,
  Trace,
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
  ExampleUiSetDef,
  exampleCodes,
  LIST_ID,
  LIST_START,
  OWNER,
  TASK_A,
  TaskCardScreenDef,
  type TaskListScreenDef,
} from '../../testing/example';
import { TaskListScreenCode } from '../../testing/example/todo/task-list.scode';
import { MemoryUiObserver } from '../../testing/memory-ui-observer';
import { taskState } from '../../testing/task-state';
import {
  ExampleMenuStubUiAppDef,
  ExampleStubUiAppDef,
} from '../../testing/ui-app.fixture';
import { UiScene } from '../../testing/ui-arch';
import { CutKit } from '../../testing/ui-cut-scene';
import {
  RuntimeKit,
  requestTrace,
  StubRefreshPort,
  StubUcPort,
  TASKS,
} from '../../testing/ui-runtime.fixture';
import type { AddressRejection } from '../address/address-codec.types';
import { ScreenDef } from '../manifest/screen-def';
import { UiModuleDef } from '../manifest/ui-module-def';
import { UiSetDef } from '../manifest/ui-set-def';
import { ScreenCode } from '../screen/screen-code';
import type { LoadContext } from '../screen/screen-code.types';
import { AppCodeLoaders } from './app-code-loaders';
import { CodeLoader, CodeLoaders } from './code-loaders';
import type { ScreenInstance } from './screen-instance';
import { ScreenRuntime, type ScreenRuntimeSpec } from './screen-runtime';

// Открытие и восстановление экземпляра экрана: загрузка через порт, отказ
// загрузки, дефекты кода экрана, снимок и восстановление. Порты — заглушки
// `ui-runtime.fixture.ts` на учебном примере.

type ListLoad = LoadContext<typeof TaskListScreenDef>;

/** `id` карточки пользователя — экрана модуля `users` набора примера. */
const USER_ID = 'exampleUi/users/userCard';

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

const CommandReadUiModuleDef = UiModuleDef.define({
  name: 'todo',
  label: 'Задачи',
  description: 'Модуль с одним экраном.',
  screens: [CommandReadScreenDef],
  stories: [],
});

const CommandReadSetDef = UiSetDef.define({
  name: 'commandUi',
  label: 'Набор с нарушением',
  description: 'Экран читает command UC.',
  app: ExampleAppDef,
  modules: [CommandReadUiModuleDef],
});

const commandReadCodes = () =>
  AppCodeLoaders.ofSet(CommandReadSetDef, [
    CodeLoaders.of(CommandReadUiModuleDef, [
      CodeLoader.screen(
        CommandReadScreenDef,
        async () => new CommandReadCode(),
      ),
    ]),
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
      data: {
        tasks: [...TASKS],
        owned: [...TASKS],
        hasMore: false,
        hasPrev: false,
      },
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
    const kit = new RuntimeKit(commandReadCodes());

    const instance = await kit.runtime.open(
      CommandReadScreenDef.at({}),
      RuntimeKit.options(),
    );

    expect(instance.view().refusal?.code).toBe('SERVER_INTERNAL');
    expect(kit.ucs.names()).not.toContain('createTask');
    expect(defectsOf(kit)).toHaveLength(1);
  });

  test('открытие со следом прогона Job — SERVER_INTERNAL, defect, UC не вызван', async () => {
    const kit = new RuntimeKit();

    const instance = await kit.runtime.open(
      TaskCardScreenDef.at({ taskId: TASK_A }),
      {
        ...RuntimeKit.options(),
        trace: Trace.forJob({ name: 'cleanup' }).toJSON(),
      },
    );

    expect(instance.view().refusal).toMatchObject({
      code: 'SERVER_INTERNAL',
      caught: false,
    });
    expect(kit.ucs.calls).toEqual([]);
    expect(defectsOf(kit)).toEqual([
      expect.objectContaining({
        node: CARD_ID,
        text: expect.stringContaining('след прогона Job cleanup'),
      }),
    ]);
  });

  test('данные загрузки не по схеме — SERVER_INTERNAL и defect', async () => {
    class BadData extends TaskListScreenCode {
      override async load() {
        return ok({
          tasks: [
            taskState({ uuid: 'не uuid', title: 'Хлеб', status: 'open' }),
          ],
          owned: [],
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

  test('экран снимка — модуля вне сборки приложения: отказ unknownScreen, не бросок; UC не вызван', async () => {
    const kit = new RuntimeKit(exampleCodes({}, ExampleStubUiAppDef));
    const json = {
      address: { screen: USER_ID, params: { userId: OWNER } },
      revision: 1,
    };

    const res = await kit.runtime.restore(json, RuntimeKit.options());

    expect(res.ok ? undefined : res.error).toEqual({
      reason: 'unknownScreen',
      screen: USER_ID,
    });
    expect(kit.ucs.calls).toEqual([]);
  });

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

  test('ревизия снимка на пределе — восстановлен, ревизия предел + 1', async () => {
    const json = {
      address: LIST_START,
      state: { selected: [] },
      revision: 2 ** 31 - 1,
    };

    const restored = restoredOf(
      await new RuntimeKit().runtime.restore(json, RuntimeKit.options()),
    );

    expect(restored.view().revision).toBe(2 ** 31);
  });

  test('ревизия снимка сверх предела — отказ malformed, UC не вызван', async () => {
    const kit = new RuntimeKit();
    const json = {
      address: LIST_START,
      state: { selected: [] },
      revision: 2 ** 31,
    };

    const res = await kit.runtime.restore(json, RuntimeKit.options());

    expect(res.ok ? undefined : res.error.reason).toBe('malformed');
    expect(kit.ucs.calls).toEqual([]);
  });
});

describe('ScreenRuntime — сборка и загрузчик', () => {
  /** Сборка исполнителя на заглушках портов: набор, сборка кода и приложение теста. */
  const build =
    (parts: Pick<ScreenRuntimeSpec, 'set' | 'codes' | 'app'>) => () =>
      new ScreenRuntime({
        ...parts,
        ucs: new StubUcPort(),
        refresh: new StubRefreshPort(),
        observer: new MemoryUiObserver(),
      });

  test('сборка другого набора — бросок с именами наборов', () => {
    expect(build({ set: CommandReadSetDef, codes: exampleCodes() })).toThrow(
      /ScreenRuntime.*exampleUi.*commandUi/,
    );
  });

  test('сборка приложения у исполнителя без приложения — бросок с именем приложения', () => {
    expect(
      build({
        set: ExampleUiSetDef,
        codes: exampleCodes({}, ExampleStubUiAppDef),
      }),
    ).toThrow(/ScreenRuntime.*exampleStub/);
  });

  test('сборка набора у исполнителя с приложением — бросок с именем приложения', () => {
    expect(
      build({
        set: ExampleUiSetDef,
        codes: exampleCodes(),
        app: ExampleStubUiAppDef,
      }),
    ).toThrow(/ScreenRuntime.*exampleStub/);
  });

  test('сборка другого приложения — бросок с именами приложений', () => {
    expect(
      build({
        set: ExampleUiSetDef,
        codes: exampleCodes({}, ExampleMenuStubUiAppDef),
        app: ExampleStubUiAppDef,
      }),
    ).toThrow(/ScreenRuntime.*exampleMenuStub.*exampleStub/);
  });

  test('приложение другого набора — бросок с именами приложения и наборов', () => {
    const { app } = new UiScene({ screens: [UiScene.screen('a')] });

    expect(
      () =>
        new ScreenRuntime({
          set: ExampleUiSetDef,
          codes: exampleCodes(),
          ucs: new StubUcPort(),
          refresh: new StubRefreshPort(),
          observer: new MemoryUiObserver(),
          app,
        }),
    ).toThrow(/miniConsole.*miniUi.*exampleUi/);
  });

  test('сбой загрузчика кода — open отклонён', async () => {
    const codes = AppCodeLoaders.ofSet(CommandReadSetDef, [
      CodeLoaders.of(CommandReadUiModuleDef, [
        CodeLoader.screen(CommandReadScreenDef, async () => {
          throw new Error('нет сети');
        }),
      ]),
    ]);
    const kit = new RuntimeKit(codes);

    const opening = kit.runtime.open(
      CommandReadScreenDef.at({}),
      RuntimeKit.options(),
    );

    await expect(opening).rejects.toThrow('нет сети');
  });
});

describe('ScreenRuntime: состав приложения', () => {
  const names = async (kit: CutKit) =>
    (await kit.open()).view().actions.map((action) => action.name);

  test('вид не содержит действие, ведущее только в сторис вне приложения', async () => {
    expect(await names(new CutKit())).toEqual(['toInside']);
  });

  test('основное действие отрезано — в виде его нет; без приложения — есть', async () => {
    expect((await new CutKit().open()).view().primary).toBeUndefined();
    expect((await new CutKit(false).open()).view().primary).toBe('toGhost');
  });

  test('без приложения в исполнителе действия не отрезаются', async () => {
    expect(await names(new CutKit(false))).toEqual(['toGhost', 'toInside']);
  });
});
