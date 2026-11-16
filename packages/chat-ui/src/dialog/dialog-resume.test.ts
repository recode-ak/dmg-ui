import { describe, expect, test } from 'bun:test';
import {
  AwaitingBus,
  MemoryLogger,
  testUuid,
  useTempDir,
} from 'dmg-core/testing';
import { ExampleApp } from 'dmg-core/testing/example';
import { ApiAppDispatch, UiServer } from 'dmg-ui/server';
import {
  ExampleUiSetDef,
  exampleCodes,
  MemoryUiObserver,
} from 'dmg-ui/testing';
import { T0 } from 'dmg-ui/testing/fixtures';
import { ExampleDialogAppDef, exampleDialogViews } from '../../testing';
import { type Dialog, DialogChannel } from './index';

// Приостановка и восстановление диалога: снимок живого экземпляра —
// внешние данные канала; невосстановленный адрес — вход `start`.

const A = testUuid(1);
const LIST = 'exampleUi/todo/taskList';
const tmp = useTempDir('dmg-ui-dialog-resume-');

/** Приложение и сервер одного каталога; канал — новый на каждый вызов. */
const world = () => {
  const bus = new AwaitingBus();
  const context = { bus, logger: new MemoryLogger() };
  const example = new ExampleApp(
    { mode: 'test', dataDir: tmp().path, users: [A] },
    { ...context, clock: () => T0 },
  );
  const server = new UiServer({
    set: ExampleUiSetDef,
    dispatch: new ApiAppDispatch(example.api),
    context,
  });
  const channel = () =>
    new DialogChannel({
      app: ExampleDialogAppDef,
      codes: exampleCodes(),
      server,
      views: exampleDialogViews,
      observer: new MemoryUiObserver(),
      identities: () => example.callers,
    });
  return { bus, channel };
};

const press = (dialog: Dialog, label: string) => {
  for (const reply of [...dialog.replies].reverse()) {
    const option = reply.options.find((o) => o.label === label);
    if (option !== undefined) return dialog.press(option.ref);
  }
  throw new Error(`нет варианта «${label}»`);
};

describe('Dialog.suspend и DialogChannel.resume', () => {
  test('suspend → resume в новом канале — тот же адрес и выбор', async () => {
    const w = world();
    const first = w.channel().person(A);
    await first.start('start');
    await first.say('Хлеб');
    await w.bus.delivered();
    await press(first, 'Отметить задачу');
    await press(first, 'Хлеб');
    const json = JSON.parse(JSON.stringify(first.suspend()));

    const second = w.channel();
    await second.resume(A, json);
    const restored = second.person(A).suspend();

    expect(restored.address).toEqual(json.address);
    expect(restored.state).toEqual(json.state);
    expect(restored.state).toEqual({ selected: [expect.any(String)] });
    expect(second.person(A).replies.length).toBeGreaterThan(0);
  });

  for (const [name, json] of [
    ['не объект', 'мусор'],
    [
      'неизвестный экран',
      { address: { screen: 'x/y/z', params: {} }, revision: 1 },
    ],
    [
      'параметры не по схеме',
      { address: { screen: LIST, params: { page: -1 } }, revision: 1 },
    ],
  ] as const) {
    test(`снимок не восстановлен (${name}) — вход start`, async () => {
      const channel = world().channel();

      await channel.resume(A, json);

      expect(channel.person(A).suspend().address).toEqual({
        screen: LIST,
        params: { page: 0 },
      });
    });
  }
});
