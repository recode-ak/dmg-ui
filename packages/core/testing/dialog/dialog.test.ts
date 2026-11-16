import { describe, expect, test } from 'bun:test';
import { Trace, UseCaseDef } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { CreateTaskUcDef, ExampleApp } from 'dmg-core/testing/example';
import { AddressCodec } from 'dmg-ui';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import * as v from 'valibot';
import {
  type Dialog,
  DialogChannel,
  type DialogReply,
  ExampleDialogAppDef,
  ExampleUiSetDef,
  exampleCodes,
  exampleDialogViews,
  MemoryUiObserver,
  TaskCardScreenDef,
} from '../index';
import { oplogRecords, T0 } from '../ui-server-fixture';

// Диалог одной личности: политики исходов ядра (таблица брифа Ф5, раздел 5),
// вход действия по шагам и проактивное обновление живого экрана. Мир —
// учебное приложение во временном каталоге: канал собирается только из
// публичного API (`DialogChannel` принимает сервер, не порты).

const A = testUuid(1);
const B = testUuid(2);
const LIST = 'exampleUi/todo/taskList';
const CARD = 'exampleUi/todo/taskCard';
const tmp = useTempDir('dmg-ui-dialog-');

const world = () => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: new ApiAppDispatch(example.api),
    context,
  });
  const observer = new MemoryUiObserver();
  const channel = new DialogChannel({
    app: ExampleDialogAppDef,
    codes: exampleCodes(),
    server,
    views: exampleDialogViews,
    observer,
    identities: () => example.callers,
  });
  /** Задача A мимо диалога: событие `created` от другого запроса. */
  const createAsA = async (title: string) => {
    const trace = Trace.fromRequest({ requestId: 'r-api' });
    const caller = await example.callers.resolve(A, trace);
    if (!caller.ok) throw new Error('A не найден');
    await example.api.dispatchByName(
      'todo',
      UseCaseDef.commandOf(CreateTaskUcDef, { title }),
      caller.value,
      trace,
    );
  };
  return { bus, observer, channel, createAsA, a: channel.person(A) };
};

type World = ReturnType<typeof world>;

const last = (replies: readonly DialogReply[]): DialogReply => {
  const reply = replies.at(-1);
  if (reply === undefined) throw new Error('реплик нет');
  return reply;
};

const labels = (reply: DialogReply) => reply.options.map((o) => o.label);

/** Ссылка варианта `label` из самой свежей реплики, где он есть. */
const ref = (replies: readonly DialogReply[], label: string): string => {
  for (const reply of [...replies].reverse()) {
    const option = reply.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

const press = (dialog: Dialog, label: string) =>
  dialog.press(ref(dialog.replies, label));

/** Шина доставила, реплики A перестали расти. */
const settle = async (w: World) => {
  await w.bus.delivered();
  let quiet = 0;
  let seen = w.a.replies.length;
  for (let tick = 0; tick < 500 && quiet < 5; tick += 1) {
    await Bun.sleep(2);
    quiet = w.a.replies.length === seen ? quiet + 1 : 0;
    seen = w.a.replies.length;
  }
};

const Record = v.object({
  op: v.string(),
  input: v.unknown(),
  result: v.object({ ok: v.boolean(), output: v.optional(v.unknown()) }),
});

const records = (op: string) =>
  oplogRecords(tmp().path)
    .map((r) => v.parse(Record, r))
    .filter((r) => r.op === op);

/** A на списке с одной задачей «Хлеб». */
const listWithBread = async () => {
  const w = world();
  await w.a.start('start');
  await w.a.say('Хлеб');
  await settle(w);
  return w;
};

/** A на карточке задачи «Хлеб». */
const cardOfBread = async () => {
  const w = await listWithBread();
  await press(w.a, 'Открыть задачу');
  await press(w.a, 'Хлеб');
  return w;
};

describe('Dialog — свободный текст и выход', () => {
  test('свободный текст — основному действию: create с этим названием', async () => {
    const w = await listWithBread();

    // Название в логе операций замаскировано (`F.sensitive` учебного
    // приложения); само название — в виде списка после создания.
    expect(records('createTask')).toMatchObject([
      { input: { title: '[redacted]' }, result: { ok: true } },
    ]);
    expect(last(w.a.replies).text).toContain('Хлеб');
  });

  test('exited — реплика выхода из Def, затем вход start приложения', async () => {
    const w = await listWithBread();
    const exit = w.a.replies.findIndex((r) =>
      r.text.includes('Задача создана'),
    );

    expect(exit).toBeGreaterThan(0);
    expect(w.a.replies.length).toBeGreaterThan(exit + 1);
    expect(w.a.suspend().address).toEqual({
      screen: LIST,
      params: { page: 0 },
    });
  });

  test('нет основного действия — «Выберите вариант», UC не вызван', async () => {
    const w = world();
    const b = w.channel.person(B);
    await b.start('assigned');

    await b.say('привет');

    expect(last(b.replies).text).toContain('Выберите вариант');
    expect(records('createTask')).toEqual([]);
  });
});

describe('Dialog — вход действия по шагам', () => {
  test('вариант поля — значение Choice.value: карточка выбранной задачи', async () => {
    const w = await cardOfBread();
    const [created] = records('createTask');

    expect(w.a.suspend().address).toEqual({
      screen: CARD,
      params: {
        taskId: v.parse(
          v.object({ taskId: v.string() }),
          created?.result.output,
        ).taskId,
      },
    });
  });

  test('rejected — повтор поля с текстом замечания; верный ввод — один act', async () => {
    const w = await cardOfBread();
    await press(w.a, 'Назначить');

    await w.a.say('не-uuid');
    const repeated = last(w.a.replies);
    await w.a.say(B);
    await settle(w);

    expect(repeated.text.length).toBeGreaterThan(0);
    expect(records('assignTask')).toMatchObject([
      { input: { assigneeId: B }, result: { ok: true } },
    ]);
  });
});

describe('Dialog — политики исходов', () => {
  test('moved — новый живой экран, прежний закрыт: старая ссылка — «Экран уже закрыт»', async () => {
    const w = await cardOfBread();
    const back = ref(w.a.replies, 'К списку');

    await w.a.press(back);
    const moved = w.a.suspend().address;
    await w.a.press(back);

    expect(moved).toEqual({ screen: LIST, params: { page: 0 } });
    expect(last(w.a.replies).text).toContain('Экран уже закрыт');
    expect(w.a.suspend().address).toEqual(moved);
  });

  test('confirm — варианты «Да»/«Нет»: «Нет» UC не вызывает, «Да» — вызывает', async () => {
    const w = await listWithBread();
    await press(w.a, 'Отметить задачу');
    await press(w.a, 'Хлеб');

    await press(w.a, 'Выполнить выбранные');
    const asked = labels(last(w.a.replies));
    await press(w.a, 'Нет');
    const afterNo = records('completeTasks');
    await press(w.a, 'Выполнить выбранные');
    await press(w.a, 'Да');
    await settle(w);

    expect(asked).toEqual(expect.arrayContaining(['Да', 'Нет']));
    expect(afterNo).toEqual([]);
    expect(records('completeTasks')).toMatchObject([{ result: { ok: true } }]);
  });

  test('недоступное по данным действие по старой ссылке — «Действие сейчас недоступно»', async () => {
    const w = await listWithBread();
    await press(w.a, 'Отметить задачу');
    await press(w.a, 'Хлеб');
    const complete = ref(w.a.replies, 'Выполнить выбранные');
    await press(w.a, 'Отметить задачу');
    await press(w.a, 'Хлеб');

    await w.a.press(complete);

    expect(last(w.a.replies).text).toContain('Действие сейчас недоступно');
    expect(records('completeTasks')).toEqual([]);
  });

  test('stale — старая ссылка после перечитывания: «Экран обновился»', async () => {
    const w = await listWithBread();
    await press(w.a, 'Отметить задачу');
    await press(w.a, 'Хлеб');
    const complete = ref(w.a.replies, 'Выполнить выбранные');
    await w.createAsA('Молоко');
    await settle(w);

    await w.a.press(complete);

    expect(w.a.replies.some((r) => r.text.includes('Экран обновился'))).toBe(
      true,
    );
    expect(records('completeTasks')).toEqual([]);
  });

  test('refused при загрузке — «Повторить» открывает тот же адрес заново', async () => {
    const w = world();
    const address = new AddressCodec(ExampleUiSetDef).encode(
      TaskCardScreenDef.at({ taskId: testUuid(99) }),
    );
    await w.channel.resume(A, { address, state: undefined, revision: 1 });
    const opened = () =>
      w.observer.records.filter((r) => r.kind === 'opened' && r.node === CARD)
        .length;
    const before = opened();

    await press(w.a, 'Повторить');

    expect(before).toBe(1);
    expect(opened()).toBe(2);
    expect(labels(last(w.a.replies))).toContain('Повторить');
    expect(w.a.suspend().address).toEqual(address);
  });
});

describe('Dialog — проактивное обновление (onChange)', () => {
  test('перечитывание по событию — новая реплика с видом без входящего сигнала', async () => {
    const w = await listWithBread();
    const before = w.a.replies.length;

    await w.createAsA('Молоко');
    await settle(w);

    expect(w.a.replies.length).toBe(before + 1);
    expect(last(w.a.replies).text).toContain('Молоко');
  });

  test('stayed и локальное действие — одна реплика от обработчика, без дубля из onChange', async () => {
    const w = await cardOfBread();
    await press(w.a, 'Назначить');
    const beforeAct = w.a.replies.length;
    await w.a.say(B);
    await settle(w);
    const acted = w.a.replies.length - beforeAct;

    await press(w.a, 'К списку');
    await press(w.a, 'Отметить задачу');
    const beforeLocal = w.a.replies.length;
    await press(w.a, 'Хлеб');
    await settle(w);

    expect(acted).toBe(1);
    expect(w.a.replies.length - beforeLocal).toBe(1);
  });
});
