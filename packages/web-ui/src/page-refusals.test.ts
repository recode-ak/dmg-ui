import { describe, expect, test } from 'bun:test';
import { err, ok, type Result } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import {
  CARD_ID,
  ExampleUiSetDef,
  exampleCodes,
  LIST_ID,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  examplePageViews,
} from '../testing';
import { PageClient } from './client/page-client';
import { PageHost } from './server/page-host';
import type { ServerMessage as ServerMsg } from './wire/page-messages.types';
import { PageWire } from './wire/page-wire';
import type { PageServerPort, ServerLink } from './wire/page-wire.types';

// Пути отказа вкладки через провод: снимок одной личности под токеном другой
// упирается в сервер (вызывающий — по токену, чужая задача не отдаётся); сообщение сервера не по схеме отказывает
// ожидающую загрузку, а не вешает вкладку.

const A = testUuid(1);
const B = testUuid(2);
const tmp = useTempDir('dmg-ui-page-refusals-');

/** Вкладка на проводе к `host` по токену. */
const tab = async (host: PageServerPort, token: string) => {
  const wire = new PageWire(host);
  const connected = await wire.connect(token);
  if (!connected.ok) throw new Error(`connect(${token}): отказ`);
  let requests = 0;
  const client = new PageClient({
    app: ExamplePagesAppDef,
    codes: exampleCodes(),
    views: examplePageViews,
    routes: examplePageRoutes,
    end: connected.value,
    observer: new MemoryUiObserver(),
    requestIds: () => {
      requests += 1;
      return `${token}-${requests}`;
    },
  });
  return { wire, client };
};

/** Учебное приложение, сервер UI и хост канала на личностях A и B. */
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
  const tokens = new Map([
    ['tA', A],
    ['tB', B],
  ]);
  const host = new PageHost({
    app: ExamplePagesAppDef,
    server,
    tokens: (token) => tokens.get(token),
    identities: () => example.callers,
    logger: context.logger,
  });
  return { bus, host };
};

/** Сервер, который на `call` отвечает сообщением не по схеме провода. */
class BrokenServer implements PageServerPort {
  async connect(
    token: string,
    push: (message: ServerMsg) => void,
  ): Promise<Result<ServerLink, 'refused'>> {
    if (token !== 't') return err('refused');
    push({
      kind: 'hello',
      context: {
        locale: 'ru-RU',
        timeZone: 'Asia/Oral',
        delegate: false,
        readOnly: false,
      },
    });
    return ok({
      receive: async (raw) => {
        if (raw.includes('"kind":"call"')) {
          push({ kind: 'result', id: 'x'.repeat(257), result: ok([]) });
        }
      },
      close: () => {},
    });
  }
}

describe('PageClient — пути отказа через провод', () => {
  test('снимок вкладки A под токеном B: карточка задачи A — отказ сервера, данных A на странице нет', async () => {
    const w = world();
    const a = await tab(w.host, 'tA');
    await a.client.route('/');
    await a.client.submit('main', 'create', { title: 'Секрет' });
    await w.bus.delivered();
    await a.wire.settled();
    await a.client.submit('main', 'open', { taskId: 'Секрет' });
    expect(a.client.region('side').view?.screen).toBe(CARD_ID);
    const snapshot = JSON.parse(JSON.stringify(a.client.snapshot()));
    const b = await tab(w.host, 'tB');

    await b.client.resume(snapshot);

    expect(b.client.region('main').view?.screen).toBe(LIST_ID);
    const side = b.client.region('side').view;
    expect(side).toMatchObject({ screen: CARD_ID, status: 'refused' });
    expect(side?.data).toBeUndefined();
    expect(b.client.page()).not.toContain('Секрет');
  });

  test('ответ сервера не по схеме — загрузка отказана, а не висит; settled бросает', async () => {
    const wire = new PageWire(new BrokenServer());
    const connected = await wire.connect('t');
    if (!connected.ok) throw new Error('connect: отказ');
    const client = new PageClient({
      app: ExamplePagesAppDef,
      codes: exampleCodes(),
      views: examplePageViews,
      routes: examplePageRoutes,
      end: connected.value,
      observer: new MemoryUiObserver(),
    });

    await client.route('/');

    expect(client.region('main').view).toMatchObject({
      screen: LIST_ID,
      status: 'refused',
      refusal: { code: 'SERVER_INTERNAL' },
    });
    expect(
      await wire.settled().then(
        () => 'тихо',
        () => 'бросил',
      ),
    ).toBe('бросил');
  });
});
