import { describe, expect, test } from 'bun:test';
import { ScreenPreview } from 'dmg-ui';
import {
  RuntimeKit,
  requestTrace,
  testRenderContext,
} from '../../ui-runtime-fixture';
import { ExampleUiSetDef, exampleCodes } from '../index';
import { ASSIGNED_ID, LIST_ID } from './example-tasks';
import { MainMenuScreenDef } from './main-menu.screen';

// Меню «Начать работу»: чтений нет, действия — переходы в сторис и выход.

const trace = requestTrace('r-menu');
const open = () =>
  new RuntimeKit().runtime.open(MainMenuScreenDef.at({}), RuntimeKit.options());
const act = async (action: string) =>
  (await open()).act({ action, revision: 1, trace });

describe('экран mainMenu', () => {
  test('загрузка ничего не читает: данные пусты, действия tasks, assigned, close', async () => {
    const kit = new RuntimeKit();

    const instance = await kit.runtime.open(
      MainMenuScreenDef.at({}),
      RuntimeKit.options(),
    );

    expect(kit.ucs.calls).toEqual([]);
    expect(instance.view()).toMatchObject({ status: 'ready', data: {} });
    expect(instance.view().actions.map((action) => action.name)).toEqual([
      'tasks',
      'assigned',
      'close',
    ]);
  });

  test('tasks переходит на список задач', async () => {
    expect(await act('tasks')).toMatchObject({
      kind: 'moved',
      address: { screen: LIST_ID },
    });
  });

  test('assigned переходит на «Назначенные мне»', async () => {
    expect(await act('assigned')).toMatchObject({
      kind: 'moved',
      address: { screen: ASSIGNED_ID },
    });
  });

  test('close завершает экран выходом closed', async () => {
    expect(await act('close')).toEqual({ kind: 'exited', exit: 'closed' });
  });

  test('примеры показываются готовым видом', async () => {
    const preview = new ScreenPreview({
      set: ExampleUiSetDef,
      codes: exampleCodes(),
    });

    for (const example of Object.keys(MainMenuScreenDef.examples)) {
      const view = await preview.screen(
        MainMenuScreenDef,
        example,
        testRenderContext,
      );

      expect(view.status).toBe('ready');
    }
  });
});
