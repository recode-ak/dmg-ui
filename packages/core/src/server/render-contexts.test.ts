import { describe, expect, test } from 'bun:test';
import {
  type Caller,
  CoreErrors,
  DelegateCaller,
  GuestCaller,
  ok,
  SystemCaller,
  type Trace,
  UserCaller,
} from 'dmg-core';
import { testTrace, testUuid } from 'dmg-core/testing';
import type { ExampleUser } from 'dmg-core/testing/example';
import {
  exampleUser,
  StubRecipientCallers,
} from '../../testing/ui-server.fixture';
import { RenderContexts } from './render-contexts';
import type { PersonPlaces, RecipientCallers } from './server.types';

// Контекст рендера личности: место — из порта мест по uuid человека из
// транспорта, признаки — из вызывающего (`RenderFlags`).

const DENIED = CoreErrors.DELEGATION_DENIED.make({ reason: 'revoked' });
const PERSON_A = testUuid(1);
const PERSON_B = testUuid(2);
const ALMATY = { locale: 'kk-KZ', timeZone: 'Asia/Almaty' };
const MOSCOW = { locale: 'ru-RU', timeZone: 'Europe/Moscow' };

/** Порт мест: место по uuid; вопросы порта по порядку. */
class StubPersonPlaces implements PersonPlaces {
  readonly asked: { readonly uuid: string; readonly trace: Trace }[] = [];

  constructor(private readonly places: ReadonlyMap<string, typeof ALMATY>) {}

  async place(uuid: string, trace: Trace) {
    this.asked.push({ uuid, trace });
    const place = this.places.get(uuid);
    if (place === undefined) throw new Error(`нет места личности ${uuid}`);
    return place;
  }
}

const placesOf = () =>
  new StubPersonPlaces(
    new Map([
      [PERSON_A, ALMATY],
      [PERSON_B, MOSCOW],
    ]),
  );

describe('RenderContexts.of — место и признаки рендера личности', () => {
  test('место — из порта личности, признаки — из вызывающего', async () => {
    const contexts = new RenderContexts(new StubRecipientCallers(), placesOf());

    const context = await contexts.of(PERSON_A, testTrace());

    expect(context).toEqual({
      ...ALMATY,
      delegate: false,
      readOnly: false,
      subject: expect.objectContaining({ uuid: PERSON_A }),
    });
  });

  test('порт места получает uuid и след сигнала', async () => {
    const callers = new StubRecipientCallers();
    const places = placesOf();
    const trace = testTrace('r-7');

    await new RenderContexts(callers, places).of(PERSON_B, trace);

    expect(places.asked.map((entry) => entry.uuid)).toEqual([PERSON_B]);
    expect(places.asked[0]?.trace).toBe(trace);
    expect(callers.resolved).toEqual([PERSON_B]);
  });

  test('заместитель с readOnly — delegate и readOnly, место — того, кто работает', async () => {
    // Работает PERSON_B за PERSON_A: uuid из транспорта — заместителя.
    const callers: RecipientCallers<ExampleUser> = {
      resolve: async () =>
        ok(
          new DelegateCaller(
            exampleUser(PERSON_A),
            exampleUser(PERSON_B),
            'd-1',
            true,
          ),
        ),
    };
    const places = placesOf();

    const context = await new RenderContexts(callers, places).of(
      PERSON_B,
      testTrace(),
    );

    expect(context).toEqual({
      ...MOSCOW,
      delegate: true,
      readOnly: true,
      subject: expect.objectContaining({ uuid: PERSON_A }),
    });
    expect(places.asked.map((entry) => entry.uuid)).toEqual([PERSON_B]);
  });

  test('вызывающий не разрешился — признаков нет, место есть', async () => {
    const callers = new StubRecipientCallers(new Map([[PERSON_A, DENIED]]));

    const context = await new RenderContexts(callers, placesOf()).of(
      PERSON_A,
      testTrace(),
    );

    expect(context).toEqual({ ...ALMATY, delegate: false, readOnly: false });
  });

  test('два человека — два места', async () => {
    const contexts = new RenderContexts(new StubRecipientCallers(), placesOf());

    const [first, second] = await Promise.all([
      contexts.of(PERSON_A, testTrace('r-1')),
      contexts.of(PERSON_B, testTrace('r-2')),
    ]);

    expect(first).toMatchObject({ ...ALMATY, subject: { uuid: PERSON_A } });
    expect(second).toMatchObject({ ...MOSCOW, subject: { uuid: PERSON_B } });
  });
});

describe('RenderContexts.of — субъект вызывающего', () => {
  const contextOf = (caller: Caller<ExampleUser> | undefined) =>
    new RenderContexts<ExampleUser>(
      {
        resolve: async () =>
          caller === undefined ? { ok: false, error: DENIED } : ok(caller),
      },
      placesOf(),
    ).of(PERSON_A, testTrace());

  test('пользователь — его субъект', async () => {
    const user = exampleUser(PERSON_A);

    const context = await contextOf(new UserCaller(user));

    expect(context.subject).toBe(user);
  });

  test('заместитель — субъект замещаемого, а не того, кто работает', async () => {
    const principal = exampleUser(PERSON_A);
    const actor = exampleUser(PERSON_B);

    const context = await contextOf(
      new DelegateCaller(principal, actor, 'd-1'),
    );

    expect(context.subject).toBe(principal);
  });

  test('система от имени человека — субъект этого человека', async () => {
    const user = exampleUser(PERSON_A);
    const system = new SystemCaller<ExampleUser>(
      { kind: 'app', module: 'test', name: 'render' },
      new UserCaller(user),
    );

    const context = await contextOf(system);

    expect(context.subject).toBe(user);
  });

  test('система без человека, гость и неразрешившийся вызывающий — субъекта нет', async () => {
    const system = new SystemCaller<ExampleUser>({
      kind: 'app',
      module: 'test',
      name: 'render',
    });

    for (const caller of [system, new GuestCaller<ExampleUser>(), undefined]) {
      expect((await contextOf(caller)).subject).toBeUndefined();
    }
  });
});
