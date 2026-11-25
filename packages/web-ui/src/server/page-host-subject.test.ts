import { describe, expect, test } from 'bun:test';
import { DelegateCaller, GuestCaller, ok, UserCaller } from 'dmg-core';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp, type ExampleUser } from 'dmg-core/testing/example';
import type { Place } from 'dmg-ui';
import {
  ExamplePagesUiAppDef,
  ExampleUiSetDef,
  exampleSubjectWire,
} from 'dmg-ui/example';
import {
  ApiAppDispatch,
  type PersonPlaces,
  type RecipientCallers,
  UiServer,
} from 'dmg-ui/server';
import { exampleUser, T0 } from 'dmg-ui/testing/fixtures';
import type { ServerMessage as ServerMsg } from '../wire/page-messages.types';
import { PageHost } from './page-host';
import { HOST_LOGS } from './page-server.const';

// Субъект в `hello`: `subjectToWire` проекта переводит субъекта вызывающего
// в JSON, учебная привязка кладёт только `{ uuid, roles }`; у заместителя
// уходит принципал, у гостя поля нет.

const A = testUuid(1);
const B = testUuid(2);
const PLACE: Place = { locale: 'ru-RU', timeZone: 'Asia/Oral' };
const places: PersonPlaces = { place: async () => PLACE };
const tmp = useTempDir('dmg-ui-page-host-subject-');

const admin = (uuid: string): ExampleUser => ({
  uuid,
  hasRole: (role) => role === 'admin',
});

type Callers = RecipientCallers<ExampleUser>;

/** Вызывающий — один и тот же для любого `uuid`. */
const callersOf = (
  caller:
    | GuestCaller<ExampleUser>
    | UserCaller<ExampleUser>
    | DelegateCaller<ExampleUser>,
): Callers => ({
  resolve: async () => ok(caller),
});

/** Хост на настоящем `UiServer`; вызывающий и перевод субъекта — по сцене. */
const hostOf = (
  callers: Callers | undefined,
  subjectToWire?: (subject: ExampleUser) => unknown,
  logger = new MemoryLogger(),
) => {
  const context = { bus: new AwaitingBus(), logger };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A, B] },
    { ...context, clock: () => T0 },
  );
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: new ApiAppDispatch(example.api),
    context,
  });
  return new PageHost<ExampleUser>({
    app: ExamplePagesUiAppDef,
    server,
    tokens: async (token) =>
      token === 'tA' ? A : token === 'tB' ? B : undefined,
    callers: callers ?? example.callers,
    places,
    logger: context.logger,
    ...(subjectToWire === undefined ? {} : { subjectToWire }),
  });
};

/** `hello` соединения по токену. */
const helloOf = async (host: PageHost<ExampleUser>, token = 'tA') => {
  const lines: string[] = [];
  const res = await host.connect(token, (text) => lines.push(text));
  if (!res.ok) throw new Error(`connect(${token}): ожидалось соединение`);
  const first: ServerMsg = JSON.parse(lines[0] ?? 'null');
  if (first.kind !== 'hello') throw new Error('первым не hello');
  return first.context;
};

describe('PageHost — субъект в hello', () => {
  test('без subjectToWire поля subject в hello нет', async () => {
    const context = await helloOf(hostOf(undefined));

    expect('subject' in context).toBe(false);
  });

  test('subjectToWire получает субъекта вызывающего, его результат — hello.context.subject', async () => {
    const seen: ExampleUser[] = [];
    const host = hostOf(undefined, (subject) => {
      seen.push(subject);
      return { id: subject.uuid };
    });

    const context = await helloOf(host);

    expect(seen.map((subject) => subject.uuid)).toEqual([A]);
    expect(context).toMatchObject({ subject: { id: A } });
  });

  test('exampleSubjectWire.toWire — только { uuid, roles }: пользователь без ролей', async () => {
    const host = hostOf(undefined, exampleSubjectWire.toWire);

    const context = await helloOf(host);

    expect(context.subject).toStrictEqual({ uuid: A, roles: [] });
  });

  test('exampleSubjectWire.toWire — администратор несёт роль admin', async () => {
    const host = hostOf(
      callersOf(new UserCaller(admin(A))),
      exampleSubjectWire.toWire,
    );

    const context = await helloOf(host);

    expect(context.subject).toStrictEqual({ uuid: A, roles: ['admin'] });
  });

  test('у заместителя уходит принципал, а не тот, кто работает', async () => {
    const delegate = new DelegateCaller(exampleUser(A), exampleUser(B), 'd-1');
    const host = hostOf(callersOf(delegate), exampleSubjectWire.toWire);

    const context = await helloOf(host, 'tB');

    expect(context.subject).toStrictEqual({ uuid: A, roles: [] });
    expect(context.delegate).toBe(true);
  });

  test('гость без субъекта — поля subject нет, subjectToWire не зовётся', async () => {
    let called = 0;
    const host = hostOf(
      callersOf(new GuestCaller<ExampleUser>()),
      (subject) => {
        called += 1;
        return subject;
      },
    );

    const context = await helloOf(host);

    expect('subject' in context).toBe(false);
    expect(called).toBe(0);
  });

  test('без subjectToWire в строке hello нет uuid личности', async () => {
    const lines: string[] = [];
    const host = hostOf(undefined);

    await host.connect('tA', (text) => lines.push(text));

    expect(lines[0]).not.toContain(A);
  });

  test('бросок subjectToWire — hello без subject, соединение одно, в логе фиксированный текст без броска', async () => {
    const logger = new MemoryLogger();
    const host = hostOf(
      undefined,
      () => {
        throw new Error('страж-перевода');
      },
      logger,
    );

    const context = await helloOf(host);

    expect('subject' in context).toBe(false);
    expect(host.delivery.connections(A)).toBe(1);
    expect(logger.records.filter((r) => r.level === 'error')).toMatchObject([
      { message: HOST_LOGS.subject },
    ]);
    expect(JSON.stringify(logger.records)).not.toContain('страж');
  });
});
