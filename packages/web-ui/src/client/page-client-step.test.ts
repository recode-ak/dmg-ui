import { describe, expect, test } from 'bun:test';
import { ok, type SerializedResult } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import type { AddressJson, UiFault } from 'dmg-ui';
import {
  ASSIGNED_ID,
  CARD_ID,
  ExamplePagesUiAppDef,
  exampleCodes,
  examplePagesRoutes,
  LIST_ID,
  TASK_A,
  TASK_B,
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
import { PageClient } from './page-client';
import { PAGE_FAULTS } from './page-client.const';
import { PageHistoryRecord } from './page-history-record';

// Правило шага приложения: `PageClientSpec.stepPlace` — ключ места по адресу
// корневой области. Смена ключа — шаг истории (новая запись), прежний ключ —
// замена. Без правила ключ — экран (D-UI-97), его закрепляют сцены истории
// `page-client.test.ts`. Сервер — заглушка конца провода с готовыми ответами.

const SUBJECT_ID = testUuid(1);
const AT = Date.UTC(2026, 0, 1);
/** Три задачи при странице из двух: у первой страницы есть «Дальше». */
const TASKS = [
  { uuid: TASK_A, title: 'Хлеб', status: 'open' },
  { uuid: TASK_B, title: 'Молоко', status: 'open' },
  { uuid: testUuid(3), title: 'Сыр', status: 'done' },
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

/** Конец провода: ответы на вызовы UC по имени — микрозадачей. */
class StubEnd implements ClientEnd {
  readonly context = CONTEXT;
  private readonly handlers: ((message: ServerMsg) => Promise<void> | void)[] =
    [];
  private readonly answers = new Map<string, SerializedResult>();

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

  async flush(): Promise<void> {
    for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
  }
}

const answered = () =>
  new StubEnd()
    .answer('listTasks', ok(TASKS))
    .answer('listAssignedTasks', ok([]));

/** Правило примера: ключ списка включает страницу, остальные экраны — по экрану. */
const paged = (address: AddressJson): string =>
  address.screen === LIST_ID
    ? JSON.stringify([address.screen, address.params])
    : address.screen;

/** Вкладка с историей после первой загрузки; `stepPlace` — правило приложения. */
const booted = async (stepPlace?: (address: AddressJson) => string) => {
  const history = new MemoryPageHistory('/');
  const end = answered();
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
    ...(stepPlace === undefined ? {} : { stepPlace }),
  });
  await client.boot();
  return { client, end, history, faults };
};

type HistoryRecordJson = {
  readonly regions: Readonly<Record<string, { readonly address: unknown }>>;
};

const recordAt = (history: MemoryPageHistory, at: number) =>
  JSON.parse(String(history.entries()[at]?.record)) as HistoryRecordJson;

const marksAt = (history: MemoryPageHistory, at = history.position) =>
  PageHistoryRecord.marks(history.entries()[at]?.record);

const urlsOf = (history: MemoryPageHistory) =>
  history.entries().map((entry) => entry.url);

const LIST_PAGE0 = { screen: LIST_ID, params: { page: 0 } };
const LIST_PAGE1 = { screen: LIST_ID, params: { page: 1 } };
const CARD_B = { screen: CARD_ID, params: { taskId: TASK_B } };
const EMPTY_REGION: PageViewState = {
  status: 'empty',
  refreshing: false,
  issues: [],
};

describe('PageClient — stepPlace: листание как шаг', () => {
  test('листание — шаг: pushes +1, запись с depth +1, URL /?page=1; у прежней записи выбор и страница 0', async () => {
    const { client, history } = await booted(paged);
    await client.local('main', 'toggle', { taskId: 'Хлеб' });

    await client.submit('main', 'next', {});

    expect(history.pushes).toBe(1);
    expect(urlsOf(history)).toEqual(['/', '/?page=1']);
    expect(history.position).toBe(1);
    expect(marksAt(history)).toEqual({ depth: 1, over: false });
    expect(recordAt(history, 0).regions.main?.address).toEqual(LIST_PAGE0);
    expect(client.region('main').view?.address).toEqual(LIST_PAGE1);
  });

  test('«Назад» — первая страница с выбором из записи; «Вперёд» — вторая; новых записей нет', async () => {
    const { client, history } = await booted(paged);
    await client.local('main', 'toggle', { taskId: 'Хлеб' });
    await client.submit('main', 'next', {});
    const pushes = history.pushes;

    await history.back();

    expect(client.region('main').view?.address).toEqual(LIST_PAGE0);
    expect(client.region('main').view?.state).toEqual({ selected: [TASK_A] });
    await history.forward();
    expect(client.region('main').view?.address).toEqual(LIST_PAGE1);
    expect(history.pushes).toBe(pushes);
    expect(urlsOf(history)).toEqual(['/', '/?page=1']);
  });

  test('листание при открытой панели — запись без over; «Назад» возвращает прежнюю страницу и панель, ещё раз — список без панели', async () => {
    const { client, history } = await booted(paged);
    await client.submit('main', 'open', { taskId: 'Молоко' });
    expect(marksAt(history)).toEqual({ depth: 1, over: true });

    await client.submit('main', 'next', {});

    expect(history.pushes).toBe(2);
    expect(history.position).toBe(2);
    expect(marksAt(history)).toEqual({ depth: 2, over: false });
    expect(marksAt(history, 1)).toEqual({ depth: 1, over: true });
    expect(history.current().url).toStartWith('/?page=1');
    await history.back();
    expect(client.region('main').view?.address).toEqual(LIST_PAGE0);
    expect(client.region('side').view?.address).toEqual(CARD_B);
    await history.back();
    expect(client.region('main').view?.address).toEqual(LIST_PAGE0);
    expect(client.region('side')).toEqual(EMPTY_REGION);
  });

  test('экраны, для которых правило вернуло экран, — как без правила: смена экрана корня — шаг, depth растёт', async () => {
    const { client, history } = await booted(paged);

    await client.route('/assigned');
    await client.route('/menu');

    expect(urlsOf(history)).toEqual(['/', '/assigned', '/menu']);
    expect(history.pushes).toBe(2);
    expect(marksAt(history)).toEqual({ depth: 2, over: false });
  });

  test('бросок правила — в faults фиксированный текст без параметров; ключ — экран: листание замена, смена экрана шаг, клиент работает', async () => {
    const { client, history, faults } = await booted(() => {
      throw new Error('секрет-42: ?page=1');
    });

    await client.submit('main', 'next', {});
    await client.route('/assigned');

    expect(faults.length).toBeGreaterThan(0);
    for (const fault of faults) {
      expect(fault.node).toBe(PAGE_CHANNEL);
      expect(fault.error).toEqual(new Error(PAGE_FAULTS.step));
    }
    expect(urlsOf(history)).toEqual(['/?page=1', '/assigned']);
    expect(history.pushes).toBe(1);
    expect(client.region('main').view?.address).toEqual({
      screen: ASSIGNED_ID,
      params: {},
    });
  });
});
