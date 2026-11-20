import { describe, expect, test } from 'bun:test';
import { ErrorDef, err, ok } from 'dmg-core';
import { GetUserUcDef, UserErrors } from 'dmg-core/testing/example';
import { RuntimeKit, requestTrace } from '../../ui-runtime.fixture';
import { LIST_ID, OWNER } from '../todo/example-tasks';
import { UserCardScreenDef } from './user-card.screen';

// Карточка пользователя: загрузка `getUser` по параметру и отказ.

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

  test('действие tasks — шаг на первую страницу списка без вызова UC', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(GetUserUcDef, ok({ userId: OWNER, active: true }));
    const instance = await open(kit);
    const before = kit.ucs.names();

    const outcome = await instance.act({
      action: 'tasks',
      input: undefined,
      revision: 1,
      trace: requestTrace('r-tasks'),
    });

    expect(outcome).toEqual({
      kind: 'moved',
      address: { screen: LIST_ID, params: { page: 0 } },
    });
    expect(kit.ucs.names()).toEqual(before);
  });
});
