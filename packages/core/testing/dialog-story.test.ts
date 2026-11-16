import { expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { ApiAppDispatch, UiNotifier, UiServer } from 'dmg-ui/server';
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
} from './index';
import { oplogRecords, T0 } from './ui-server-fixture';

// Сквозной тест сторис на диалоговом канале (TST-09 — единственный; бывший
// `ui-two-users.test.ts`, критерии 5 и 6): пользователи A и B, учебное
// приложение во временном каталоге, сервер UI, уведомитель с доставкой
// канала и диалоговый канал на публичных входах.

const A = testUuid(1);
const B = testUuid(2);
const LIST = 'exampleUi/todo/taskList';
const CARD = 'exampleUi/todo/taskCard';
const ASSIGNED = 'exampleUi/todo/assignedTasks';
const tmp = useTempDir('dmg-ui-dialog-story-');

/** Приложение, сервер, канал и уведомитель с доставкой канала. */
const world = () => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const dispatch = new ApiAppDispatch(example.api);
  const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
  const codes = exampleCodes();
  const observer = new MemoryUiObserver();
  let requests = 0;
  const channel = new DialogChannel({
    app: ExampleDialogAppDef,
    codes,
    server,
    views: exampleDialogViews,
    observer,
    identities: () => example.callers,
    requestIds: () => {
      requests += 1;
      return `r-${requests}`;
    },
  });
  new UiNotifier({
    app: ExampleDialogAppDef,
    codes,
    dispatch,
    callers: example.callers,
    delivery: channel.delivery,
    observer,
    context,
  }).start();
  return { bus, a: channel.person(A), b: channel.person(B) };
};

type World = ReturnType<typeof world>;

/** Последняя реплика; нет — ошибка теста. */
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

/** Шина доставила, реплики и `inbox` обоих перестали расти. */
const settle = async (w: World) => {
  await w.bus.delivered();
  const size = () =>
    w.a.replies.length +
    w.a.inbox.length +
    w.b.replies.length +
    w.b.inbox.length;
  let quiet = 0;
  let seen = size();
  for (let tick = 0; tick < 500 && quiet < 5; tick += 1) {
    await Bun.sleep(2);
    quiet = size() === seen ? quiet + 1 : 0;
    seen = size();
  }
};

const Record = v.object({
  op: v.string(),
  caller: v.object({
    kind: v.string(),
    subjectId: v.optional(v.string()),
  }),
  trace: v.object({
    cause: v.object({ kind: v.string() }),
    correlationId: v.string(),
  }),
  result: v.object({ ok: v.boolean() }),
  events: v.array(v.object({ name: v.string() })),
});

/** Записи лога операций с операцией `op`. */
const records = (op: string) =>
  oplogRecords(tmp().path)
    .map((r) => v.parse(Record, r))
    .filter((r) => r.op === op);

test('сторис на диалоговом канале: задачи A, поручение B, перечитывание и уведомления от имени B', async () => {
  const w = world();
  const { a, b } = w;

  // 0. B открывает свой список «Мои задачи» — пусто.
  await b.start('start');
  const listOfB = b.suspend();
  expect(listOfB.address).toEqual({ screen: LIST, params: { page: 0 } });
  expect(b.replies).toHaveLength(1);

  // 2. A: «Мои задачи»; свободный текст — основное действие `create`, выход
  // `created`, затем снова вход `start`.
  await a.start('start');
  await a.say('Хлеб');
  await settle(w);
  expect(a.replies.some((r) => r.text.includes('Задача создана'))).toBe(true);
  expect(a.suspend().address).toEqual({ screen: LIST, params: { page: 0 } });

  // Событие `created` субъекта A список B не перечитывает: ревизия прежняя,
  // новых реплик нет (критерий 6, бывший `ui-two-users`).
  expect(b.suspend().revision).toBe(listOfB.revision);
  expect(b.replies).toHaveLength(1);

  // 1. B открывает «Назначенные мне» — пусто; список B закрыт.
  await b.start('assigned');
  expect(b.suspend().address).toEqual({ screen: ASSIGNED, params: {} });
  expect(b.replies).toHaveLength(2);

  // 3. Ещё две задачи: на странице две, есть «Дальше».
  await a.say('Молоко');
  await a.say('Сыр');
  await settle(w);
  expect(labels(last(a.replies))).toContain('Дальше');

  // 4. «Дальше» — вторая страница; старая ссылка — экран уже закрыт.
  const next = ref(a.replies, 'Дальше');
  await a.press(next);
  expect(a.suspend().address).toEqual({ screen: LIST, params: { page: 1 } });
  expect(last(a.replies).text).toContain('Сыр');
  await a.press(next);
  expect(last(a.replies).text).toContain('Экран уже закрыт');

  // 5. «Назад» — первая страница.
  await press(a, 'Назад');
  expect(a.suspend().address).toEqual({ screen: LIST, params: { page: 0 } });

  // 6. Локальное действие: выбор двух задач вариантами поля.
  await press(a, 'Отметить задачу');
  await press(a, 'Хлеб');
  await press(a, 'Отметить задачу');
  await press(a, 'Молоко');
  expect(a.suspend().state).toEqual({
    selected: [expect.any(String), expect.any(String)],
  });

  // 7. «Выполнить выбранные» — подтверждение, «Да» — `completeTasks`.
  await press(a, 'Выполнить выбранные');
  expect(labels(last(a.replies))).toEqual(
    expect.arrayContaining(['Да', 'Нет']),
  );
  await press(a, 'Да');
  await settle(w);
  expect(records('completeTasks')).toMatchObject([
    { result: { ok: true }, events: [{}, {}] },
  ]);
  expect(labels(last(a.replies))).not.toContain('Выполнить выбранные');

  // 8. Карточка «Сыр»; «Назначить» — текстовый ввод исполнителя B.
  await press(a, 'Открыть задачу');
  await press(a, 'Сыр');
  expect(a.suspend().address.screen).toBe(CARD);
  await press(a, 'Назначить');
  await a.say(B);
  await settle(w);

  // 9. У B — проактивная реплика живого экрана и уведомление; карточку A
  // событие назначения не перечитало. Реплик B три: список, «Назначенные
  // мне», проактивная.
  expect(b.replies).toHaveLength(3);
  expect(last(b.replies).text).toContain('Сыр');
  expect(b.inbox).toHaveLength(1);
  expect(b.inbox[0]?.text).toContain('Вам назначена задача');
  expect(b.inbox[0]?.text).toContain('Сыр');
  expect(b.inbox[0]?.options.map((o) => o.label)).toContain('Назначенные мне');
  expect(a.suspend().revision).toBe(2);

  // 10. A выполняет задачу на карточке: действие стало недоступным, B
  // получил «Поручение выполнено» (получатель — из `getTaskAssignee`).
  await press(a, 'Выполнить');
  await settle(w);
  expect(labels(last(a.replies))).not.toContain('Выполнить');
  expect(b.inbox).toHaveLength(2);
  expect(b.inbox[1]?.text).toContain('Поручение выполнено');
  expect(b.inbox[1]?.text).toContain('Сыр');

  // Лог операций: B читает от своего имени по событию с цепочкой запроса A;
  // A перечитывает свой список по своему событию;
  // получатель — запрос системы; `listTasks` B звал только запросом открытия
  // своего списка (шаг 0), по событию A — ни разу.
  const [assign] = records('assignTask');
  expect(assign?.trace.correlationId).toMatch(/^r-/);
  const readsB = records('listAssignedTasks')
    .filter((r) => r.caller.subjectId === B)
    .map((r) => `${r.trace.cause.kind}:${r.trace.correlationId}`);
  const [complete] = records('completeTask');
  // Ровно: открытие «Назначенных мне» (r-5 — пятый запрос сюжета: B start,
  // A start, create, start после выхода, B assigned), перечитывание по
  // назначению и чтение уведомления «назначена» — цепочка назначения A,
  // чтение уведомления «выполнено» — цепочка выполнения A.
  expect(readsB.toSorted()).toEqual(
    [
      'request:r-5',
      `event:${assign?.trace.correlationId}`,
      `event:${assign?.trace.correlationId}`,
      `event:${complete?.trace.correlationId}`,
    ].toSorted(),
  );
  // Свой экран перечитан своим событием: список A — по выполнению выбранных.
  const [completeMany] = records('completeTasks');
  expect(
    records('listTasks')
      .filter((r) => r.caller.subjectId === A)
      .map((r) => `${r.trace.cause.kind}:${r.trace.correlationId}`),
  ).toContain(`event:${completeMany?.trace.correlationId}`);
  const assignee = records('getTaskAssignee');
  expect(assignee.length).toBeGreaterThan(0);
  expect(assignee.every((r) => r.caller.kind === 'system')).toBe(true);
  expect(
    records('listTasks')
      .filter((r) => r.caller.subjectId === B)
      .map((r) => `${r.trace.cause.kind}:${r.trace.correlationId}`),
  ).toEqual(['request:r-1']);

  // Ревизии и входящие: события A экран B не перечитывали (кроме
  // назначения), у A уведомлений нет, у B — ровно две.
  expect(b.suspend().revision).toBe(2);
  expect(a.inbox).toEqual([]);
  expect(b.inbox).toHaveLength(2);
});
