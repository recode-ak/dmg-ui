import { describe, expect, test } from 'bun:test';
import {
  CoreErrors,
  type DomainError,
  ErrorDef,
  ErrorText,
  err,
  ok,
} from 'dmg-core';
import {
  CompleteTasksUcDef,
  CompleteTaskUcDef,
  CreateTaskUcDef,
  ListTasksUcDef,
  TaskErrors,
} from 'dmg-core/testing/example';
import * as v from 'valibot';
import {
  CARD_ID,
  exampleCodes,
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
  TaskListScreenDef,
} from '../../testing/example';
import { TaskCardScreenCode } from '../../testing/example/todo/task-card.code';
import { TaskListScreenCode } from '../../testing/example/todo/task-list.code';
import { taskState } from '../../testing/task-state';
import { UiScene } from '../../testing/ui-arch';
import { CutKit } from '../../testing/ui-cut-scene';
import {
  RuntimeKit,
  requestTrace,
  testRenderContext,
} from '../../testing/ui-runtime-fixture';
import { ScreenDef } from '../manifest/screen-def';
import { Availability } from '../screen/availability';
import { ScreenCode } from '../screen/screen-code';
import type { ActionSteps, LoadContext } from '../screen/screen-code.types';
import { CodeLoader, CodeLoaders } from './code-loaders';
import type { ViewChange } from './outcome.types';

// Действия экземпляра экрана: порядок шагов `act`, проверка перехода,
// подтверждение, отказы, ревизия и очередь, локальные действия.

type List = typeof TaskListScreenDef;
type Card = typeof TaskCardScreenDef;

const trace = requestTrace('r-act');
const listSteps = new TaskListScreenCode().actions;
const cardSteps = new TaskCardScreenCode().actions;
const wire = (error: DomainError) => err(ErrorDef.serialize(error));

const CREATE = {
  action: 'create',
  input: { title: 'Хлеб' },
  revision: 1,
  trace,
} as const;

/** `create` ведёт на экран вне `to` — необъявленный переход. */
class Jump extends TaskListScreenCode {
  override readonly actions: Partial<ActionSteps<List>> = {
    ...listSteps,
    create: { done: () => TaskCardScreenDef.at({ taskId: TASK_A }) },
  };
}

/** `back` возвращает выход чужого экрана — необъявленный выход. */
class ForeignExit extends TaskCardScreenCode {
  override readonly actions: Partial<ActionSteps<Card>> = {
    ...cardSteps,
    back: {
      done: () => TaskListScreenDef.exits.created.with({ taskId: TASK_A }),
    },
  };
}

/** `create` перехватывает отказ: коды — в `seen`. */
class Caught extends TaskListScreenCode {
  readonly seen: string[] = [];
  override readonly actions: Partial<ActionSteps<List>> = {
    ...listSteps,
    create: {
      done: () => TaskListScreenDef.exits.closed.with(),
      caught: (_, error) => {
        this.seen.push(error.code);
        return TaskListScreenDef.exits.closed.with();
      },
    },
  };
}

/** Контекст `load` и шага `open` и субъект функции доступности — в `seen`. */
class Spy extends TaskListScreenCode {
  readonly seen: unknown[] = [];
  readonly judged: unknown[] = [];
  override readonly actions: Partial<ActionSteps<List>> = {
    ...listSteps,
    open: {
      done: ({ context, input }) => {
        this.seen.push(context);
        return TaskCardScreenDef.at(input);
      },
    },
  };

  override readonly availability = {
    close: (ctx: { readonly subject?: unknown }) => {
      this.judged.push(ctx.subject);
      return Availability.yes();
    },
  };

  override async load(ctx: LoadContext<List>) {
    this.seen.push(ctx.context);
    return super.load(ctx);
  }
}

/** Замена доступности: что скрыть и что отключить с текстом `OFF`. */
const OFF = 'Пока нельзя';
class Gated extends TaskListScreenCode {
  constructor(
    private readonly hide: readonly string[],
    private readonly disable: readonly string[],
  ) {
    super();
  }

  private answer(name: string) {
    if (this.hide.includes(name)) return Availability.hidden();
    if (this.disable.includes(name)) return Availability.disabled(OFF);
    return Availability.yes();
  }

  override readonly availability = {
    create: () => this.answer('create'),
    close: () => this.answer('close'),
    next: () => this.answer('next'),
    toggle: () => this.answer('toggle'),
  };
}

/** Доступность `close` и `toggle`, бросающая со второго вызова: открытие проходит, исполнение — дефект. */
class Flaky extends TaskListScreenCode {
  private readonly calls = new Map<string, number>();

  private once(name: string) {
    const next = (this.calls.get(name) ?? 0) + 1;
    this.calls.set(name, next);
    if (next > 1) throw new Error('сбой доступности');
    return Availability.yes();
  }

  override readonly availability = {
    close: () => this.once('close'),
    toggle: () => this.once('toggle'),
  };
}

/** `toggle` возвращает состояние не по схеме — дефект кода. */
class BadToggle extends TaskListScreenCode {
  override readonly locals = {
    toggle: () => ({ selected: 'все' }) as unknown as { selected: string[] },
  };
}

/** Список с выбранной задачей `TASK_A`. */
const selectedList = async (kit: RuntimeKit) => {
  const list = await kit.openList();
  await list.local({ name: 'toggle', input: { taskId: TASK_A } });
  return list;
};

/** Карточка в отказе загрузки: `listTasks` отвечает `ACCESS_DENIED`. */
const refusedCard = async (kit = new RuntimeKit()) => {
  const denied = CoreErrors.ACCESS_DENIED.make({
    rule: 'isOwner',
    denyMessage: 'Нет',
  });
  kit.ucs.answer(ListTasksUcDef, wire(denied));
  return kit.openCard();
};

/** Карточка с ответом `completeTask` — успех. */
const cardWithComplete = async (kit = new RuntimeKit()) => {
  kit.ucs.answer(CompleteTaskUcDef, ok({}));
  return kit.openCard();
};

describe('ScreenInstance.act — переходы', () => {
  test('moved — на экран из to действия', async () => {
    const list = await new RuntimeKit().openList();

    const outcome = await list.act({
      action: 'open',
      input: { taskId: TASK_A },
      revision: 1,
      trace,
    });

    expect(outcome).toEqual({
      kind: 'moved',
      address: { screen: CARD_ID, params: { taskId: TASK_A } },
    });
  });

  test('stayed — свой экран с равными параметрами: ревизия + 1 и onChange', async () => {
    const card = await cardWithComplete();
    const changes: number[] = [];
    card.onChange(() => changes.push(card.view().revision));

    const outcome = await card.act({ action: 'complete', revision: 1, trace });

    expect(outcome).toEqual({ kind: 'stayed', revision: 2 });
    expect(changes).toContain(2);
  });

  test('stayed — onChange с причиной acted и ревизией после перечитывания', async () => {
    const card = await cardWithComplete();
    const changes: ViewChange[] = [];
    card.onChange((change: ViewChange) => changes.push(change));

    await card.act({ action: 'complete', revision: 1, trace });

    expect(changes).toEqual([{ cause: 'acted', revision: 2 }]);
  });

  test('exited — выход своего экрана, после него act — unavailable/closed', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(CreateTaskUcDef, ok({ taskId: TASK_B }));
    const list = await kit.openList();

    const exited = await list.act(CREATE);
    const after = await list.act({ action: 'next', revision: 1, trace });

    expect(exited).toEqual({
      kind: 'exited',
      exit: 'created',
      data: { taskId: TASK_B },
    });
    expect(after).toEqual({ kind: 'unavailable', reason: 'closed' });
  });
});

describe('ScreenInstance.act — необъявленное', () => {
  test('переход на экран вне to — дефект: SERVER_INTERNAL и запись defect', async () => {
    const kit = new RuntimeKit(exampleCodes({ list: new Jump() }));
    kit.ucs.answer(CreateTaskUcDef, ok({ taskId: TASK_B }));
    const list = await kit.openList();

    const outcome = await list.act(CREATE);

    expect(outcome).toMatchObject({
      kind: 'refused',
      refusal: { code: 'SERVER_INTERNAL', caught: false },
    });
    expect(kit.observer.kinds()).toContain('defect');
  });

  test('выход не из exits своего экрана — дефект', async () => {
    const kit = new RuntimeKit(exampleCodes({ card: new ForeignExit() }));
    const card = await kit.openCard();

    const outcome = await card.act({ action: 'back', revision: 1, trace });

    expect(outcome).toMatchObject({
      kind: 'refused',
      refusal: { code: 'SERVER_INTERNAL', caught: false },
    });
    expect(kit.observer.kinds()).toContain('defect');
  });
});

describe('ScreenInstance.act — отказ загрузки и порт', () => {
  test('экземпляр в отказе — unavailable/disabled, UC не вызван', async () => {
    const kit = new RuntimeKit();
    const card = await refusedCard(kit);

    const outcome = await card.act({ action: 'back', revision: 1, trace });

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
  });

  test('бросок порта UC — дефект: SERVER_INTERNAL и запись defect', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(CompleteTaskUcDef, () => {
      throw new Error('сеть');
    });
    const card = await kit.openCard();

    const outcome = await card.act({ action: 'complete', revision: 1, trace });

    expect(outcome).toMatchObject({
      kind: 'refused',
      refusal: { code: 'SERVER_INTERNAL', caught: false },
    });
    expect(kit.observer.kinds()).toContain('defect');
  });
});

describe('ScreenInstance.act — подтверждение', () => {
  test('без confirmed — исход confirm с текстами манифеста, UC не вызван', async () => {
    const kit = new RuntimeKit();
    const list = await selectedList(kit);

    const outcome = await list.act({
      action: 'completeSelected',
      revision: 1,
      trace,
    });

    expect(outcome).toEqual({
      kind: 'confirm',
      label: 'Выполнить выбранные задачи?',
      description: 'Выполненную задачу нельзя вернуть в работу.',
    });
    expect(kit.ucs.names()).not.toContain('completeTasks');
  });

  test('с confirmed — UC вызван', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(CompleteTasksUcDef, ok({}));
    const list = await selectedList(kit);

    const outcome = await list.act({
      action: 'completeSelected',
      revision: 1,
      confirmed: true,
      trace,
    });

    expect(outcome).toEqual({ kind: 'stayed', revision: 2 });
    expect(kit.ucs.names()).toContain('completeTasks');
  });

  test('command строит вход UC из состояния', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(CompleteTasksUcDef, ok({}));
    const list = await selectedList(kit);

    await list.act({
      action: 'completeSelected',
      revision: 1,
      confirmed: true,
      trace,
    });

    expect(kit.ucs.calls).toContainEqual({
      module: 'todo',
      uc: 'completeTasks',
      input: { taskIds: [TASK_A] },
      requestId: 'r-act',
    });
  });
});

describe('ScreenInstance.act — вход и доступность', () => {
  test('вход не по схеме — rejected с полем, UC не вызван', async () => {
    const kit = new RuntimeKit();
    const list = await kit.openList();

    const outcome = await list.act({
      action: 'create',
      input: { title: '' },
      revision: 1,
      trace,
    });

    expect(outcome).toMatchObject({
      kind: 'rejected',
      issues: [{ field: 'title' }],
    });
    expect(kit.ucs.names()).toEqual(['listTasks']);
  });

  test('отключённое доступностью действие — unavailable/disabled', async () => {
    const list = await new RuntimeKit().openList();

    const outcome = await list.act({ action: 'next', revision: 1, trace });

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
  });

  test('имя не из манифеста — unavailable/unknown', async () => {
    const list = await new RuntimeKit().openList();

    const outcome = await list.act({ action: 'missing', revision: 1, trace });

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'unknown' });
  });
});

describe('ScreenInstance.act — только чтение', () => {
  test('действие с uc — unavailable/readOnly, UC не вызван', async () => {
    const kit = new RuntimeKit();
    const list = await kit.openList({ readOnly: true });

    const outcome = await list.act(CREATE);

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'readOnly' });
    expect(kit.ucs.names()).toEqual(['listTasks']);
  });

  test('действие без uc доступно', async () => {
    const list = await new RuntimeKit().openList({ readOnly: true });

    const outcome = await list.act({
      action: 'open',
      input: { taskId: TASK_A },
      revision: 1,
      trace,
    });

    expect(outcome.kind).toBe('moved');
  });

  test('вид отключает действие с uc текстом ядра, без uc — доступно', async () => {
    const list = await new RuntimeKit().openList({ readOnly: true });

    const actions = list.view().actions;

    expect(actions.find((a) => a.name === 'create')?.availability).toEqual({
      kind: 'disabled',
      text: expect.stringMatching(/\S/),
    });
    expect(actions.find((a) => a.name === 'open')?.availability).toEqual({
      kind: 'available',
    });
  });
});

describe('ScreenInstance.act — отказ UC', () => {
  test('неперехваченный — refused, текст — только главная строка', async () => {
    const kit = new RuntimeKit();
    const invalid = CoreErrors.INPUT_VALIDATION.make({
      issues: [{ path: 'taskId', message: 'Задача не по схеме' }],
    });
    kit.ucs.answer(CompleteTaskUcDef, wire(invalid));
    const card = await kit.openCard();

    const outcome = await card.act({ action: 'complete', revision: 1, trace });

    expect(outcome).toEqual({
      kind: 'refused',
      refusal: {
        code: 'INPUT_VALIDATION',
        text: ErrorText.of(invalid).summary,
        caught: false,
      },
    });
  });

  test('перехваченный — переход из caught, caught получил ошибку', async () => {
    const caught = new Caught();
    const kit = new RuntimeKit(exampleCodes({ list: caught }));
    kit.ucs.answer(
      CreateTaskUcDef,
      wire(TaskErrors.TOO_MANY_OPEN.make({ limit: 5 })),
    );
    const list = await kit.openList();

    const outcome = await list.act(CREATE);

    expect(outcome).toEqual({ kind: 'exited', exit: 'closed' });
    expect(caught.seen).toEqual(['TASK_TOO_MANY_OPEN']);
  });

  test('код из catches, а caught у действия нет — refused с caught: true', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(
      CreateTaskUcDef,
      wire(TaskErrors.TOO_MANY_OPEN.make({ limit: 5 })),
    );
    const list = await kit.openList();

    const outcome = await list.act(CREATE);

    expect(outcome).toMatchObject({
      kind: 'refused',
      refusal: { code: 'TASK_TOO_MANY_OPEN', caught: true },
    });
  });
});

describe('ScreenInstance.act — ревизия и очередь', () => {
  test('устаревшая ревизия — stale с текущей, UC не вызван', async () => {
    const kit = new RuntimeKit();
    const card = await cardWithComplete(kit);

    const outcome = await card.act({ action: 'complete', revision: 2, trace });

    expect(outcome).toEqual({ kind: 'stale', revision: 1 });
    expect(kit.ucs.names()).not.toContain('completeTask');
  });

  test('два act подряд с ревизией 1 — первый stayed, второй stale', async () => {
    const card = await cardWithComplete();

    const outcomes = await Promise.all([
      card.act({ action: 'complete', revision: 1, trace }),
      card.act({ action: 'complete', revision: 1, trace }),
    ]);

    expect(outcomes).toEqual([
      { kind: 'stayed', revision: 2 },
      { kind: 'stale', revision: 2 },
    ]);
  });
});

describe('ScreenInstance — контекст', () => {
  test('язык, зона и субъект доходят до load и шагов действия', async () => {
    const spy = new Spy();
    const list = await new RuntimeKit(exampleCodes({ list: spy })).openList();

    await list.act({
      action: 'open',
      input: { taskId: TASK_A },
      revision: 1,
      trace,
    });

    const { locale, timeZone, subject } = testRenderContext;
    expect(spy.seen).toEqual([
      { locale, timeZone, subject },
      { locale, timeZone, subject },
    ]);
  });

  test('субъект доходит до функции доступности: при открытии и при исполнении', async () => {
    const spy = new Spy();
    const list = await new RuntimeKit(exampleCodes({ list: spy })).openList();

    await list.act({ action: 'close', revision: 1, trace });

    const { subject } = testRenderContext;
    expect(spy.judged).toEqual([subject, subject]);
  });

  test('вид не несёт субъекта: контекст вида — место и признаки', async () => {
    const list = await new RuntimeKit().openList();

    const context = list.view().context;

    expect('subject' in context).toBe(false);
    expect(context).toStrictEqual({
      locale: testRenderContext.locale,
      timeZone: testRenderContext.timeZone,
      delegate: false,
      readOnly: false,
    });
  });
});

describe('ScreenInstance.local', () => {
  test('changed — новое состояние, onChange, ревизия прежняя', async () => {
    const list = await new RuntimeKit().openList();
    let changed = 0;
    list.onChange(() => {
      changed += 1;
    });

    const outcome = await list.local({
      name: 'toggle',
      input: { taskId: TASK_A },
    });

    expect(outcome).toEqual({ kind: 'changed' });
    expect(changed).toBe(1);
    expect(list.view()).toMatchObject({
      revision: 1,
      state: { selected: [TASK_A] },
    });
  });

  test('changed — onChange с причиной local, ревизия прежняя', async () => {
    const list = await new RuntimeKit().openList();
    const changes: ViewChange[] = [];
    list.onChange((change: ViewChange) => changes.push(change));

    await list.local({ name: 'toggle', input: { taskId: TASK_A } });

    expect(changes).toEqual([{ cause: 'local', revision: 1 }]);
  });

  test('вход не по схеме — rejected с полем, состояние прежнее', async () => {
    const list = await new RuntimeKit().openList();

    const outcome = await list.local({ name: 'toggle', input: { taskId: 42 } });

    expect(outcome).toMatchObject({
      kind: 'rejected',
      issues: [{ field: 'taskId' }],
    });
    expect(list.view().state).toEqual({ selected: [] });
  });

  test('состояние не по схеме — refused/SERVER_INTERNAL, вид и состояние прежние, запись defect', async () => {
    const kit = new RuntimeKit(exampleCodes({ list: new BadToggle() }));
    const list = await kit.openList();
    const before = list.view();
    let changed = 0;
    list.onChange(() => {
      changed += 1;
    });

    const outcome = await list.local({
      name: 'toggle',
      input: { taskId: TASK_A },
    });

    expect(outcome).toMatchObject({
      kind: 'refused',
      refusal: { code: 'SERVER_INTERNAL', caught: false },
    });
    expect(list.view()).toEqual(before);
    expect(changed).toBe(0);
    expect(kit.observer.kinds()).toContain('defect');
  });

  test('закрытый экземпляр — unavailable/closed', async () => {
    const list = await new RuntimeKit().openList();
    list.close();

    const outcome = await list.local({
      name: 'toggle',
      input: { taskId: TASK_A },
    });

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'closed' });
  });

  test('имя не из locals — unavailable/unknown', async () => {
    const list = await new RuntimeKit().openList();

    const outcome = await list.local({ name: 'missing' });

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'unknown' });
  });

  test('экземпляр в отказе — unavailable/disabled', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(
      ListTasksUcDef,
      wire(
        CoreErrors.ACCESS_DENIED.make({ rule: 'isOwner', denyMessage: 'Нет' }),
      ),
    );
    const list = await kit.openList();

    const outcome = await list.local({
      name: 'toggle',
      input: { taskId: TASK_A },
    });

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
  });
});

describe('ScreenInstance.act — отрезанная ветка приложения', () => {
  test('действие, ведущее только в сторис вне приложения, — unavailable/unknown', async () => {
    const hub = await new CutKit().open();

    const outcome = await hub.act({ action: 'toGhost', revision: 1, trace });

    expect(outcome).toEqual({ kind: 'unavailable', reason: 'unknown' });
  });

  test('остальные действия экрана исполняются: moved на экран приложения', async () => {
    const hub = await new CutKit().open();

    const outcome = await hub.act({ action: 'toInside', revision: 1, trace });

    expect(outcome).toEqual({
      kind: 'moved',
      address: { screen: 'miniUi/todo/inside', params: {} },
    });
  });
});

describe('ScreenInstance — доступность в виде', () => {
  const kitOf = (code: TaskListScreenCode) =>
    new RuntimeKit(exampleCodes({ list: code }));

  test('скрытое действие — нет в actions, остальные на месте', async () => {
    const list = await kitOf(new Gated(['create', 'close'], [])).openList();

    const names = list.view().actions.map((action) => action.name);

    expect(names).toEqual(['open', 'completeSelected', 'next', 'prev']);
  });

  test('скрытое локальное действие — нет в locals', async () => {
    const list = await kitOf(new Gated(['toggle'], [])).openList();

    expect(list.view().locals).toEqual([]);
  });

  test('отключённое действие и локальное — в виде с текстом, доступное — без текста', async () => {
    const list = await kitOf(new Gated([], ['next', 'toggle'])).openList();
    const view = list.view();
    const action = (name: string) => view.actions.find((a) => a.name === name);

    expect(action('next')?.availability).toStrictEqual({
      kind: 'disabled',
      text: OFF,
    });
    expect(view.locals[0]?.availability).toStrictEqual({
      kind: 'disabled',
      text: OFF,
    });
    expect(action('close')?.availability).toStrictEqual({ kind: 'available' });
  });

  test('основное действие скрытого — вид без primary; отключённого — primary остаётся', async () => {
    const hidden = await kitOf(new Gated(['create'], [])).openList();
    const disabled = await kitOf(new Gated([], ['create'])).openList();

    expect(hidden.view().primary).toBeUndefined();
    expect(disabled.view().primary).toBe('create');
  });

  test.each([
    ['скрытое', new Gated(['create'], [])],
    ['отключённое', new Gated([], ['create'])],
  ])(
    'act по действию: %s — unavailable/disabled без текста, UC не вызван',
    async (_, code) => {
      const kit = kitOf(code);
      const list = await kit.openList();

      const outcome = await list.act(CREATE);

      expect(outcome).toStrictEqual({
        kind: 'unavailable',
        reason: 'disabled',
      });
      expect(kit.ucs.names()).toEqual(['listTasks']);
    },
  );

  test.each([
    ['скрытое', new Gated(['toggle'], [])],
    ['отключённое', new Gated([], ['toggle'])],
  ])('local: %s — unavailable/disabled, состояние прежнее', async (_, code) => {
    const list = await kitOf(code).openList();

    const outcome = await list.local({
      name: 'toggle',
      input: { taskId: TASK_A },
    });

    expect(outcome).toStrictEqual({ kind: 'unavailable', reason: 'disabled' });
    expect(list.view().state).toEqual({ selected: [] });
  });

  test('бросок функции доступности при открытии — вид в отказе SERVER_INTERNAL, запись defect', async () => {
    class Broken extends TaskListScreenCode {
      override readonly availability = {
        close: () => {
          throw new Error('сбой доступности');
        },
      };
    }
    const kit = kitOf(new Broken());

    const view = (await kit.openList()).view();

    expect(view.status).toBe('refused');
    expect(view.refusal).toMatchObject({ code: 'SERVER_INTERNAL' });
    expect(kit.observer.kinds()).toContain('defect');
  });

  test('бросок функции доступности при act — refused/SERVER_INTERNAL, запись defect', async () => {
    const kit = kitOf(new Flaky());
    const list = await kit.openList();

    const outcome = await list.act({ action: 'close', revision: 1, trace });

    expect(outcome).toMatchObject({
      kind: 'refused',
      refusal: { code: 'SERVER_INTERNAL', caught: false },
    });
    expect(kit.observer.kinds()).toContain('defect');
  });

  test('бросок функции доступности при local — refused/SERVER_INTERNAL, состояние прежнее', async () => {
    const kit = kitOf(new Flaky());
    const list = await kit.openList();

    const outcome = await list.local({
      name: 'toggle',
      input: { taskId: TASK_A },
    });

    expect(outcome).toMatchObject({
      kind: 'refused',
      refusal: { code: 'SERVER_INTERNAL', caught: false },
    });
    expect(list.view().state).toEqual({ selected: [] });
    expect(kit.observer.kinds()).toContain('defect');
  });
});

// Экран, чья доступность решается признаком из ответа query UC: данные
// загрузки несут число открытых задач из ответа `listTasks`.

const FlagScreenDef = ScreenDef.define({
  name: 'flag',
  label: 'Признак',
  description: 'Действие доступно, пока в ответе есть открытые задачи.',
  reads: [ListTasksUcDef],
  data: v.object({
    open: v.pipe(v.number(), v.description('Открытых задач в ответе')),
  }),
  actions: {
    finish: { label: 'Закончить', description: 'Нужна открытая задача.' },
  },
});

type Flag = typeof FlagScreenDef;

class FlagCode extends ScreenCode<Flag> {
  override readonly actions: Partial<ActionSteps<Flag>> = {
    finish: { done: () => FlagScreenDef.at({}) },
  };

  override readonly availability = {
    finish: ({ data }: { readonly data: { readonly open: number } }) =>
      Availability.when(data.open > 0, 'Открытых задач нет'),
  };

  override async load({ read }: LoadContext<Flag>) {
    const listed = await read(ListTasksUcDef, {});
    if (!listed.ok) return listed;
    return ok({
      open: listed.value.filter((task) => task.status === 'open').length,
    });
  }
}

const flagged = (rows: ReturnType<typeof taskState>[]) => {
  const { set } = new UiScene({ screens: [FlagScreenDef] });
  const codes = CodeLoaders.of(set, [
    CodeLoader.screen(FlagScreenDef, async () => new FlagCode()),
  ]);
  const kit = new RuntimeKit(codes, set);
  kit.ucs.answer(ListTasksUcDef, ok(rows));
  return kit.runtime.open(FlagScreenDef.at({}), RuntimeKit.options());
};

describe('ScreenInstance — основание доступности: признак из ответа query UC', () => {
  test('в ответе read есть открытая задача — действие доступно', async () => {
    const row = taskState({ uuid: TASK_A, title: 'Хлеб', status: 'open' });

    const view = (await flagged([row])).view();

    expect(view.actions[0]?.availability).toEqual({ kind: 'available' });
  });

  test('в ответе read открытых нет — отключено с текстом автора, act — unavailable', async () => {
    const row = taskState({ uuid: TASK_B, title: 'Молоко', status: 'done' });
    const instance = await flagged([row]);

    const outcome = await instance.act({
      action: 'finish',
      revision: 1,
      trace,
    });

    expect(instance.view().actions[0]?.availability).toEqual({
      kind: 'disabled',
      text: 'Открытых задач нет',
    });
    expect(outcome).toEqual({ kind: 'unavailable', reason: 'disabled' });
  });
});
