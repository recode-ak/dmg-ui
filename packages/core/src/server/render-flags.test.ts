import { describe, expect, test } from 'bun:test';
import { DelegateCaller, SystemCaller, UserCaller } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { exampleUser } from '../../testing/ui-server-fixture';
import { RenderFlags } from './render-flags';

// Признаки рендера из вызывающего: заместитель и
// «только чтение» канал кладёт в `RenderContext`.

const PRINCIPAL = exampleUser(testUuid(1));
const ACTOR = exampleUser(testUuid(2));

describe('RenderFlags.of — признаки рендера из Caller', () => {
  test('свой вызывающий — не заместитель, не только чтение', () => {
    const flags = RenderFlags.of(new UserCaller(PRINCIPAL));

    expect({ ...flags }).toEqual({ delegate: false, readOnly: false });
  });

  test('заместитель — delegate, без readOnly', () => {
    const caller = new DelegateCaller(PRINCIPAL, ACTOR, 'd-1');

    expect({ ...RenderFlags.of(caller) }).toEqual({
      delegate: true,
      readOnly: false,
    });
  });

  test('заместитель только на чтение — delegate и readOnly', () => {
    const caller = new DelegateCaller(PRINCIPAL, ACTOR, 'd-1', true);

    expect({ ...RenderFlags.of(caller) }).toEqual({
      delegate: true,
      readOnly: true,
    });
  });

  test('система от имени заместителя — признаки заместителя', () => {
    const origin = new DelegateCaller(PRINCIPAL, ACTOR, 'd-1', true);
    const caller = new SystemCaller(
      { kind: 'app', module: 'exampleUi', name: 'entry' },
      origin,
    );

    expect({ ...RenderFlags.of(caller) }).toEqual({
      delegate: true,
      readOnly: true,
    });
  });
});
