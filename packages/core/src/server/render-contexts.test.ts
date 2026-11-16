import { describe, expect, test } from 'bun:test';
import { CoreErrors, DelegateCaller, ok, type Trace } from 'dmg-core';
import { testTrace, testUuid } from 'dmg-core/testing';
import type { ExampleUser } from 'dmg-core/testing/example';
import {
  exampleUser,
  StubRecipientCallers,
} from '../../testing/ui-server-fixture';
import { RenderContexts } from './render-contexts';
import type { PersonPlaces, RecipientCallers } from './server.types';

// Контекст рендера личности: место — из порта мест по uuid человека из
// транспорта, признаки — из вызывающего (`RenderFlags`).

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

    expect(context).toEqual({ ...ALMATY, delegate: false, readOnly: false });
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

    expect(context).toEqual({ ...MOSCOW, delegate: true, readOnly: true });
    expect(places.asked.map((entry) => entry.uuid)).toEqual([PERSON_B]);
  });

  test('вызывающий не разрешился — признаков нет, место есть', async () => {
    const denied = CoreErrors.DELEGATION_DENIED.make({ reason: 'revoked' });
    const callers = new StubRecipientCallers(new Map([[PERSON_A, denied]]));

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

    expect(first).toEqual({ ...ALMATY, delegate: false, readOnly: false });
    expect(second).toEqual({ ...MOSCOW, delegate: false, readOnly: false });
  });
});
