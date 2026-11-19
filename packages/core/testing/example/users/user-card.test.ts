import { describe, expect, test } from 'bun:test';
import { ErrorDef, err, ok } from 'dmg-core';
import { GetUserUcDef, UserErrors } from 'dmg-core/testing/example';
import * as v from 'valibot';
import { RuntimeKit } from '../../ui-runtime-fixture';
import { OWNER } from '../todo/example-tasks';
import { UserCardScreenDef } from './user-card.screen';

// Карточка пользователя: загрузка `getUser` по параметру, отказ и пример Def.

const open = (kit: RuntimeKit) =>
  kit.runtime.open(
    UserCardScreenDef.at({ userId: OWNER }),
    RuntimeKit.options(),
  );

describe('экран userCard', () => {
  test('загрузка зовёт getUser модуля users с userId из параметров', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(GetUserUcDef, ok({ userId: OWNER, active: true }));

    const instance = await open(kit);

    expect(kit.ucs.calls).toEqual([
      {
        module: 'users',
        uc: 'getUser',
        input: { userId: OWNER },
        requestId: 'r-open',
      },
    ]);
    expect(instance.view()).toMatchObject({
      status: 'ready',
      data: { userId: OWNER, active: true },
    });
  });

  test('отказ getUser (нет пользователя) отдаётся как отказ загрузки', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(
      GetUserUcDef,
      err(ErrorDef.serialize(UserErrors.NOT_FOUND.make({ userId: OWNER }))),
    );

    const instance = await open(kit);

    expect(instance.view()).toMatchObject({ status: 'refused' });
  });

  test('пример Def подходит под схему данных и параметров', () => {
    for (const example of Object.values(UserCardScreenDef.examples)) {
      expect(v.safeParse(UserCardScreenDef.data, example.data).success).toBe(
        true,
      );
      expect(
        v.safeParse(UserCardScreenDef.params, example.params).success,
      ).toBe(true);
    }
    expect(Object.keys(UserCardScreenDef.examples)).not.toHaveLength(0);
  });
});
