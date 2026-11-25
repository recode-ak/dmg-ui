import { describe, expect, test } from 'bun:test';
import { ErrorDef, err, ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { GetUserUcDef, UserErrors } from 'dmg-core/testing/example';
import { RuntimeKit, requestTrace } from 'dmg-ui/testing/fixtures';
import { OWNER, ProfileSummaryScreenDef } from '../../../../platform/ui';

// Профиль: загрузка `getUser` по субъекту беседы, переход на карточку и выход.

const me = { uuid: OWNER, hasRole: () => false };
const trace = requestTrace('r-profile');

const open = (kit: RuntimeKit) =>
  kit.runtime.open(
    ProfileSummaryScreenDef.at({}),
    RuntimeKit.options({ subject: me }),
  );

describe('экран profileSummary', () => {
  test('загрузка зовёт getUser с uuid субъекта, а не с параметром адреса', async () => {
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

  test('отказ getUser отдаётся как отказ загрузки', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(
      GetUserUcDef,
      err(ErrorDef.serialize(UserErrors.NOT_FOUND.make({ userId: OWNER }))),
    );

    const instance = await open(kit);

    expect(instance.view()).toMatchObject({ status: 'refused' });
  });

  test('card ведёт на карточку пользователя из данных профиля, UC не зовётся', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(GetUserUcDef, ok({ userId: testUuid(5), active: false }));
    const instance = await open(kit);
    const before = kit.ucs.names();

    const outcome = await instance.act({ action: 'card', revision: 1, trace });

    expect(outcome).toEqual({
      kind: 'moved',
      address: {
        screen: 'exampleUi/users/userCard',
        params: { userId: testUuid(5) },
      },
    });
    expect(kit.ucs.names()).toEqual(before);
  });

  test('close завершает экран выходом closed', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(GetUserUcDef, ok({ userId: OWNER, active: true }));
    const instance = await open(kit);

    expect(await instance.act({ action: 'close', revision: 1, trace })).toEqual(
      { kind: 'exited', exit: 'closed' },
    );
  });
});
