import { describe, expect, test } from 'bun:test';
import { MemoryLogger } from 'dmg-core/testing';
import {
  LimitedMessenger,
  type Message,
  MessengerCapabilitiesSchema,
  type MessengerPort,
  TextBuilder,
  TextLength,
} from 'dmg-ui/chat-ui';
import * as v from 'valibot';
import { MemoryMessenger } from './memory-messenger';

// Граница общей части и мессенджеров: два подставных набора различаются
// возможностями, и общая часть видит разницу только через них — по журналу
// одного и того же сценария и по тому, что страж делает с одним сообщением.

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;
const PEER = 'peer-a';

const HELLO: Message = {
  kind: 'text',
  text: TextBuilder.of('Привет'),
  options: [],
};
const BYE: Message = {
  kind: 'text',
  text: TextBuilder.of('Пока'),
  options: [],
};

/** Показать → обновить → по инициативе, когда окно уже закрылось бы. */
const scenario = async (
  port: MessengerPort,
  time: { now: number },
): Promise<void> => {
  const shown = await port.show(PEER, HELLO);
  if (!shown.ok) throw new Error('показ не дошёл');
  await port.update(PEER, shown.value, BYE);
  time.now = T0 + DAY;
  await port.show(PEER, HELLO, { initiative: true });
};

describe('подставные мессенджеры', () => {
  test('подставные мессенджеры различимы тестом возможностей', async () => {
    const editingTime = { now: T0 };
    const windowedTime = { now: T0 };
    const editing = MemoryMessenger.editing();
    const windowed = MemoryMessenger.windowed(() => windowedTime.now);
    const a = editing.capabilities;
    const b = windowed.capabilities;

    for (const capabilities of [a, b]) {
      expect(
        v.safeParse(MessengerCapabilitiesSchema, capabilities).success,
      ).toBe(true);
      expect(JSON.parse(JSON.stringify(capabilities))).toStrictEqual(
        capabilities,
      );
    }
    expect(a.edit).not.toBe(b.edit);
    expect(a.options.max).not.toBe(b.options.max);
    expect(a.initiative).not.toEqual(b.initiative);
    expect(a.pressAnswer).toBeDefined();
    expect(b.pressAnswer).toBeUndefined();

    await scenario(editing, editingTime);
    await scenario(windowed, windowedTime);

    expect(editing.journal.map((entry) => entry.op)).toEqual([
      'sent',
      'edited',
      'sent',
    ]);
    expect(windowed.journal.map((entry) => entry.op)).toEqual([
      'sent',
      'sent',
      'undelivered',
    ]);
    expect(windowed.journal.at(-1)).toEqual({
      op: 'undelivered',
      via: 'show',
      peer: PEER,
      reason: 'window',
    });
  });

  test('одно сообщение общей части через страж — на обоих', async () => {
    const shared: Message = {
      kind: 'text',
      text: new TextBuilder()
        .bold('Задачи на неделю')
        .paragraph()
        .text('а'.repeat(1500))
        .build(),
      options: [
        { ref: 'r1', label: 'Открыть' },
        { ref: 'r2', label: 'Отложить на потом все задачи' },
        { ref: 'r3', label: 'Назад' },
        { ref: 'r4', label: 'Меню' },
      ],
    };
    const editing = MemoryMessenger.editing();
    const windowed = MemoryMessenger.windowed(() => T0);
    const editingLog = new MemoryLogger();
    const windowedLog = new MemoryLogger();

    await new LimitedMessenger({ port: editing, logger: editingLog }).show(
      PEER,
      shared,
    );
    await new LimitedMessenger({ port: windowed, logger: windowedLog }).show(
      PEER,
      shared,
    );

    expect(editing.journal).toEqual([
      { op: 'sent', via: 'show', peer: PEER, handle: 'm1', message: shared },
    ]);
    expect(editingLog.records).toEqual([]);

    const entry = windowed.journal[0];
    if (entry?.op !== 'sent') throw new Error('сообщение не дошло');
    const sent = entry.message;
    expect(new TextLength('codePoint').of(sent.text)).toBe(1024);
    expect(sent.text[0]).toEqual({
      text: 'Задачи на неделю',
      styles: ['bold'],
    });
    expect(sent.options.map((o) => o.ref)).toEqual(['r1', 'r2', 'r3']);
    expect(
      sent.options.map((o) => new TextLength('grapheme').ofString(o.label)),
    ).toEqual([7, 20, 5]);
    expect(windowedLog.records.map((r) => [r.level, r.meta?.limit])).toEqual([
      ['error', 'options'],
      ['warn', 'label'],
      ['warn', 'textWithOptions'],
    ]);
  });
});
