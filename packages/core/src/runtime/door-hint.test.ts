import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { ListAssignedTasksUcDef } from 'dmg-core/testing/example';
import * as v from 'valibot';
import {
  AssignedTasksScreenDef,
  ExampleUiSetDef,
  exampleCodes,
  FollowAssignedStoryDef,
  MainMenuScreenDef,
  ViewUserStoryDef,
} from '../../testing/example';
import {
  ExampleMenuStubAppDef,
  ExampleMenuTrimmedStubAppDef,
} from '../../testing/ui-app-fixture';
import { UiScene } from '../../testing/ui-arch';
import { RuntimeKit } from '../../testing/ui-runtime-fixture';
import { ScreenDef } from '../manifest/screen-def';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import { ScreenCode } from '../screen/screen-code';
import type { ActionSteps } from '../screen/screen-code.types';
import { CodeLoader, CodeLoaders } from './code-loaders';

// Подсказка двери в виде экземпляра: действие-переход без своей подсказки
// получает подсказку ровно одной сторис-цели; доступность сторис вид не
// вычисляет — скрытая кодом экрана дверь в виде отсутствует вместе с подсказкой.

const open = (kit: RuntimeKit) =>
  kit.runtime.open(MainMenuScreenDef.at({}), RuntimeKit.options());
const menuKit = () =>
  new RuntimeKit(exampleCodes(), ExampleUiSetDef, ExampleMenuStubAppDef);

describe('меню в приложении: подсказка двери из сторис-цели', () => {
  test('«Назначенные мне» — подсказка сторис followAssigned', async () => {
    const view = (await open(menuKit())).view();

    const assigned = view.actions.find((a) => a.name === 'assigned');

    expect(FollowAssignedStoryDef.hint).toBeString();
    expect(assigned?.hint).toBe(FollowAssignedStoryDef.hint!);
  });

  test('«Мои задачи» — две сторис-цели с общим стартом: ключа hint нет', async () => {
    const view = (await open(menuKit())).view();

    const tasks = view.actions.find((a) => a.name === 'tasks');

    expect(tasks).toBeDefined();
    expect(tasks).not.toHaveProperty('hint');
  });

  test('«Закрыть» — не дверь: ключа hint нет', async () => {
    const view = (await open(menuKit())).view();

    expect(view.actions.find((a) => a.name === 'close')).not.toHaveProperty(
      'hint',
    );
  });
});

describe('меню без приложения: подстановки нет', () => {
  test('у «Назначенные мне» ключа hint нет', async () => {
    const view = (await open(new RuntimeKit())).view();

    const assigned = view.actions.find((a) => a.name === 'assigned');

    expect(assigned).toBeDefined();
    expect(assigned).not.toHaveProperty('hint');
  });
});

describe('«Назначенные мне»: карточка исполнителя по составу приложения', () => {
  const assignedOf = async (app?: AnyUiAppDef) => {
    const kit = new RuntimeKit(exampleCodes(), ExampleUiSetDef, app);
    kit.ucs.answer(ListAssignedTasksUcDef, ok([]));
    const instance = await kit.runtime.open(
      AssignedTasksScreenDef.at({}),
      RuntimeKit.options(),
    );
    return instance.view().actions;
  };

  test('карточка в составе приложения — подсказка сторис viewUser', async () => {
    const actions = await assignedOf(ExampleMenuStubAppDef);

    const card = actions.find((a) => a.name === 'openAssignee');

    expect(ViewUserStoryDef.hint).toBeString();
    expect(card?.hint).toBe(ViewUserStoryDef.hint!);
  });

  test('приложение без viewUser — действия openAssignee нет: отрезанное подсказки не даёт', async () => {
    const actions = await assignedOf(ExampleMenuTrimmedStubAppDef);

    expect(actions.map((a) => a.name)).not.toContain('openAssignee');
    expect(actions.map((a) => a.name)).toContain('close');
  });

  test('без приложения — действие есть, подсказки нет', async () => {
    const actions = await assignedOf(undefined);

    const card = actions.find((a) => a.name === 'openAssignee');

    expect(card).toBeDefined();
    expect(card).not.toHaveProperty('hint');
  });
});

describe('своя подсказка действия побеждает подсказку сторис', () => {
  const HINT_NEXT = 'Подсказка следующей сторис';
  const HINT_OTHER = 'Подсказка другой сторис';
  const OWN = 'Своя подсказка двери';

  const nextScreen = UiScene.screen('nextScreen', { reads: [] });
  const otherScreen = UiScene.screen('otherScreen', { reads: [] });
  const next = UiScene.story('next', [nextScreen], { hint: HINT_NEXT });
  const other = UiScene.story('other', [otherScreen], { hint: HINT_OTHER });
  const hub = ScreenDef.define({
    name: 'hub',
    label: 'Узел',
    description: 'Экран с двумя дверями.',
    reads: [],
    data: v.object({}),
    actions: {
      toNext: {
        label: 'Дальше',
        description: 'Дверь со своей подсказкой.',
        hint: OWN,
        to: () => [nextScreen],
      },
      toOther: {
        label: 'В другую',
        description: 'Дверь без своей подсказки.',
        to: () => [otherScreen],
      },
    },
  });
  const root = UiScene.story('root', [hub], { leads: () => [next, other] });
  const scene = new UiScene({
    screens: [hub, nextScreen, otherScreen],
    stories: [root, next, other],
  });

  class HubCode extends ScreenCode<typeof hub> {
    override readonly actions: Partial<ActionSteps<typeof hub>> = {
      toNext: { done: () => nextScreen.at({}) },
      toOther: { done: () => otherScreen.at({}) },
    };

    override async load() {
      return ok({});
    }
  }

  class QuietCode extends ScreenCode<ScreenDef> {
    override async load() {
      return ok({});
    }
  }

  const kitOf = (withApp: boolean) =>
    new RuntimeKit(
      CodeLoaders.of(scene.set, [
        CodeLoader.screen(hub, async () => new HubCode()),
        CodeLoader.screen(nextScreen, async () => new QuietCode()),
        CodeLoader.screen(otherScreen, async () => new QuietCode()),
      ]),
      scene.set,
      withApp ? scene.app : undefined,
    );
  const actionsOf = async (withApp: boolean) =>
    (await kitOf(withApp).runtime.open(hub.at({}), RuntimeKit.options())).view()
      .actions;

  test('в приложении: у двери со своей подсказкой — своя, у другой — подсказка её сторис', async () => {
    const actions = await actionsOf(true);

    expect(actions.find((a) => a.name === 'toNext')?.hint).toBe(OWN);
    expect(actions.find((a) => a.name === 'toOther')?.hint).toBe(HINT_OTHER);
  });

  test('без приложения: своя подсказка остаётся, подстановки нет', async () => {
    const actions = await actionsOf(false);

    expect(actions.find((a) => a.name === 'toNext')?.hint).toBe(OWN);
    expect(actions.find((a) => a.name === 'toOther')).not.toHaveProperty(
      'hint',
    );
  });
});
