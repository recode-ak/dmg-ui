import { describe, expect, test } from 'bun:test';
import { ok, type SerializedResult } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import type { UiFault } from 'dmg-ui';
import {
  ASSIGNED_ID,
  AssignedTasksScreenDef,
  CARD_ID,
  ExamplePagesUiAppDef,
  exampleCodes,
  examplePagesRoutes,
  LIST_ID,
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
} from 'dmg-ui/example';
import { MemoryUiObserver } from 'dmg-ui/testing';
import * as v from 'valibot';
import { ManualPageClock, MemoryPageHistory } from '../../testing';
import { PAGE_CHANNEL } from '../page-channel.const';
import type { PageViewState } from '../view/page-view-state.types';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import { PageClient, type PagePlacement } from './page-client';
import { PAGE_FAULTS } from './page-client.const';
import { PageHistoryRecord } from './page-history-record';

// «Назад» на отложенной подставе истории: `back()` порта разрешается до
// `popstate`, страница видит запись цели только по `release()`. Здесь —
// промежуточное состояние и гонки действий человека с переходом. Итог после
// `release()` на синхронной подставе закреплён сценами истории
// `page-client.test.ts`. Сервер — заглушка конца провода с готовыми ответами.

const SUBJECT_ID = testUuid(1);
const AT = Date.UTC(2026, 0, 1);
const TASKS = [
  { uuid: TASK_A, title: 'Хлеб', status: 'open' },
  { uuid: TASK_B, title: 'Молоко', status: 'open' },
].map((row) => ({
  ...row,
  createdAt: AT,
  updatedAt: AT,
  version: 1,
  ownerId: SUBJECT_ID,
}));

const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
  subject: { uuid: SUBJECT_ID, roles: [] },
};

const SubjectWire = v.strictObject({
  uuid: v.string(),
  roles: v.array(v.string()),
});

const reviveSubject = (raw: unknown) => {
  const wire = v.parse(SubjectWire, raw);
  return {
    uuid: wire.uuid,
    hasRole: (role: string) => wire.roles.includes(role),
  };
};

/** Конец провода: ответы на вызовы UC по имени — микрозадачей; журнал имён вызовов. */
class StubEnd implements ClientEnd {
  readonly context = CONTEXT;
  private readonly handlers: ((message: ServerMsg) => Promise<void> | void)[] =
    [];
  private readonly answers = new Map<string, SerializedResult>();
  private readonly called: string[] = [];

  answer(uc: string, result: SerializedResult): this {
    this.answers.set(uc, result);
    return this;
  }

  onMessage(handler: (message: ServerMsg) => Promise<void> | void): void {
    this.handlers.push(handler);
  }

  onBreak(_handler: (error: Error) => void): void {}

  close(): void {}

  send(message: ClientMsg): void {
    if (message.kind !== 'call') return;
    this.called.push(message.call.uc);
    const result = this.answers.get(message.call.uc);
    if (result === undefined) {
      throw new Error(`StubEnd: нет ответа на ${message.call.uc}`);
    }
    Promise.resolve().then(() => {
      for (const handler of this.handlers) {
        handler({ kind: 'result', id: message.id, result });
      }
    });
  }

  /** Сколько раз вызван `uc`. */
  count(uc: string): number {
    return this.called.filter((name) => name === uc).length;
  }

  async flush(): Promise<void> {
    for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
  }
}

/** Подставная история, у которой можно отнять `back()`: отказ порта. */
class RefusingHistory extends MemoryPageHistory {
  refusing = true;

  override back(): Promise<void> {
    if (this.refusing) return Promise.reject(new Error('отказ порта'));
    return super.back();
  }
}

const CARD_IN_MODAL: readonly PagePlacement[] = [
  { screen: TaskCardScreenDef, region: 'modal' },
];
const ASSIGNED_IN_MODAL: readonly PagePlacement[] = [
  { screen: AssignedTasksScreenDef, region: 'modal' },
];
const MENU_ID = 'exampleUi/todo/mainMenu';
const LIST = { screen: LIST_ID, params: { page: 0 } };
const ASSIGNED = { screen: ASSIGNED_ID, params: {} };
const CARD_B = { screen: CARD_ID, params: { taskId: TASK_B } };
const CARD_LINK = { screen: CARD_ID, params: { taskId: TASK_A } };
const EMPTY_REGION: PageViewState = {
  status: 'empty',
  refreshing: false,
  issues: [],
};

/** Отложенная история вкладки, начатая на `url`. */
const deferredAt = (url = '/') => new MemoryPageHistory(url, null, 'deferred');

/** Вкладка с историей после первой загрузки по текущей записи. */
const booted = async (
  history: MemoryPageHistory,
  placements?: readonly PagePlacement[],
) => {
  const end = new StubEnd()
    .answer('listTasks', ok(TASKS))
    .answer('listAssignedTasks', ok([]));
  const faults: UiFault[] = [];
  const client = new PageClient({
    app: ExamplePagesUiAppDef,
    codes: exampleCodes({}, ExamplePagesUiAppDef),
    routes: examplePagesRoutes,
    end,
    observer: new MemoryUiObserver(),
    clock: new ManualPageClock(),
    reviveSubject,
    faults: (fault) => {
      faults.push(fault);
    },
    history,
    ...(placements === undefined ? {} : { placements }),
  });
  await client.boot();
  return { client, end, faults, history };
};

/** «Назад» человека: переход начат, `popstate` ещё не пришёл. */
const goBack = (history: MemoryPageHistory) => {
  void history.back();
};

const urlsOf = (history: MemoryPageHistory) =>
  history.entries().map((entry) => entry.url);

const marksAt = (history: MemoryPageHistory, at = history.position) =>
  PageHistoryRecord.marks(history.entries()[at]?.record);

type HistoryRecordJson = {
  readonly regions: Readonly<Record<string, { readonly state?: unknown }>>;
};

const recordAt = (history: MemoryPageHistory, at: number) =>
  JSON.parse(String(history.entries()[at]?.record)) as HistoryRecordJson;

describe('PageClient — «Назад» человека до popstate', () => {
  test('окно открыто: до release() оно открыто, после — закрыто; записей не прибавилось, корень не перечитан', async () => {
    const { client, end, history } = await booted(deferredAt(), CARD_IN_MODAL);
    await client.submit('main', 'open', { taskId: 'Молоко' });
    expect(urlsOf(history)).toEqual(['/', '/']);
    const main = client.region('main');
    const lists = end.count('listTasks');
    const pushes = history.pushes;

    goBack(history);
    await end.flush();

    expect(history.pending).toBe(1);
    expect(client.region('modal').view?.address).toEqual(CARD_B);
    await history.release();
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(history.position).toBe(0);
    expect(history.pushes).toBe(pushes);
    expect(client.region('main')).toBe(main);
    expect(end.count('listTasks')).toBe(lists);
  });

  test('выбор строки в корне до release(): после popstate выбор цел, итоговая замена пишется в запись цели', async () => {
    const { client, end, history } = await booted(deferredAt(), CARD_IN_MODAL);
    await client.submit('main', 'open', { taskId: 'Молоко' });
    goBack(history);

    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    await history.release();
    await end.flush();

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(history.position).toBe(0);
    expect(recordAt(history, 0).regions.main?.state).toEqual({
      selected: [TASK_A],
    });
  });

  test('открытие окна человеком до release(): после popstate окно закрыто, страница — запись цели, призраков нет, faults пусты, следующий шаг пишет запись', async () => {
    const { client, end, history, faults } = await booted(
      deferredAt(),
      CARD_IN_MODAL,
    );
    await client.route('/assigned');
    expect(urlsOf(history)).toEqual(['/', '/assigned']);
    goBack(history);

    await client.openLink(CARD_LINK);
    expect(client.region('modal').view?.address).toEqual({
      screen: CARD_ID,
      params: { taskId: TASK_A },
    });
    await history.release();
    await end.flush();

    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.url()).toBe('/');
    expect(history.position).toBe(0);
    expect(history.pending).toBe(0);
    expect(urlsOf(history)).toEqual(['/', '/assigned']);
    expect(faults).toEqual([]);
    const pushes = history.pushes;
    await client.route('/assigned');
    expect(history.pushes).toBe(pushes + 1);
    expect(history.position).toBe(1);
    expect(urlsOf(history)).toEqual(['/', '/assigned']);
    expect(marksAt(history)).toEqual({ depth: 1, over: false });
  });

  test('два «Назад» подряд на трёх записях: страница по очереди на второй и первой записи, без отказов, порт не покидается', async () => {
    const { client, history, faults } = await booted(deferredAt());
    await client.route('/assigned');
    await client.route('/menu');
    expect(urlsOf(history)).toEqual(['/', '/assigned', '/menu']);

    goBack(history);
    goBack(history);
    expect(history.pending).toBe(2);
    await history.release();
    expect(client.region('main').view?.address).toEqual(ASSIGNED);
    await history.release();

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(history.position).toBe(0);
    expect(history.pending).toBe(0);
    expect(history.leaves).toBe(0);
    expect(faults).toEqual([]);
  });
});

describe('PageClient — закрытие слоя клиентом до popstate', () => {
  test('стек список → меню → окно: окно закрыто сразу, запись снимается по popstate; «Назад» ведёт на место перед списком, закрытое окно не возвращается', async () => {
    const { client, end, history } = await booted(
      deferredAt(),
      ASSIGNED_IN_MODAL,
    );
    await client.route('/menu');
    await client.openLink(ASSIGNED);
    expect(urlsOf(history)).toEqual(['/', '/menu', '/menu']);
    expect(marksAt(history)).toEqual({ depth: 2, over: true });
    const pushes = history.pushes;

    client.close('modal');
    await end.flush();

    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(history.position).toBe(2);
    expect(history.pending).toBe(1);
    await history.release();
    expect(history.position).toBe(1);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
    expect(client.region('main').view?.screen).toBe(MENU_ID);
    expect(history.pushes).toBe(pushes);
    goBack(history);
    await history.release();
    expect(history.position).toBe(0);
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
  });

  test('второе закрытие слоя до release(): в порту один переход, leaves = 0', async () => {
    const { client, end, history } = await booted(deferredAt(), CARD_IN_MODAL);
    await client.submit('main', 'open', { taskId: 'Молоко' });
    client.close('modal');
    await end.flush();
    expect(history.pending).toBe(1);

    await client.submit('main', 'open', { taskId: 'Молоко' });
    client.close('modal');
    await end.flush();

    expect(history.pending).toBe(1);
    expect(history.leaves).toBe(0);
    await history.release();
    expect(history.position).toBe(0);
    expect(history.pending).toBe(0);
    expect(history.leaves).toBe(0);
    expect(client.region('modal')).toEqual(EMPTY_REGION);
  });
});

describe('PageClient — «Назад» за пределы своих записей', () => {
  test('выход корня с целью back при depth 0 — вход start; порт «Назад» не получил: pending = 0, leaves = 0', async () => {
    const { client, end, history } = await booted(deferredAt('/assigned'));

    const outcome = await client.submit('main', 'close', {});
    await end.flush();

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(urlsOf(history)).toEqual(['/assigned', '/']);
    expect(history.pending).toBe(0);
    expect(history.leaves).toBe(0);
  });
});

describe('PageClient — заметка выхода при движении назад', () => {
  const CLOSED_NOTE = AssignedTasksScreenDef.exits.closed.label;

  test('отложенная подстава: до release() заметки нет, после — на корне заметка с текстом выхода', async () => {
    const { client, end, history } = await booted(deferredAt());
    await client.route('/assigned');

    const outcome = await client.submit('main', 'close', {});
    await end.flush();

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'closed' });
    expect(history.pending).toBe(1);
    expect(client.region('main').view?.address).toEqual(ASSIGNED);
    expect(client.region('main').note).toBeUndefined();
    await history.release();
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('main').note).toBe(CLOSED_NOTE);
  });

  test('синхронная подстава: заметка на корне сразу после submit', async () => {
    const { client, end } = await booted(new MemoryPageHistory('/'));
    await client.route('/assigned');

    await client.submit('main', 'close', {});
    await end.flush();

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('main').note).toBe(CLOSED_NOTE);
  });

  test('отказ порта: заметки нет, в faults — сбой истории; на следующем «Назад» человека заметка не всплывает', async () => {
    const history = new RefusingHistory('/');
    const { client, end, faults } = await booted(history);
    await client.route('/assigned');

    await client.submit('main', 'close', {});
    await end.flush();

    expect(client.region('main').view?.address).toEqual(ASSIGNED);
    expect(client.region('main').note).toBeUndefined();
    expect(faults.map((fault) => fault.error)).toEqual([
      new Error(PAGE_FAULTS.history),
    ]);
    expect(faults[0]?.node).toBe(PAGE_CHANNEL);
    history.refusing = false;
    await history.back();
    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('main').note).toBeUndefined();
  });

  test('«Назад» человека без выхода: после popstate заметки нет', async () => {
    const { client, history } = await booted(deferredAt());
    await client.route('/assigned');

    goBack(history);
    await history.release();

    expect(client.region('main').view?.address).toEqual(LIST);
    expect(client.region('main').note).toBeUndefined();
  });
});
