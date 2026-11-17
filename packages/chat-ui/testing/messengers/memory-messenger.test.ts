import { describe, expect, test } from 'bun:test';
import { err, ok } from 'dmg-core';
import type {
  Message,
  MessageOption,
  MessengerCapabilities,
} from 'dmg-ui/chat-ui';
import type { ChatLine } from '..';
import { MemoryMessenger } from './memory-messenger';

// Подставной мессенджер в памяти: одна реализация порта, поведение выводится
// из возможностей. Правка — только при `edit`; окно инициативы — по часам
// теста; сообщение, которое страж изменил бы, и пустой текст без вариантов
// отвергаются. Недоставка — значение и запись `undelivered` в журнале.
// `chat` — тот же журнал глазами собеседника: что он видит и что ушло.

const DAY = 86_400_000;
const T0 = 1_700_000_000_000;
const A = 'peer-a';
const B = 'peer-b';

const message = (
  text: string,
  options: readonly MessageOption[] = [],
): Message => ({ kind: 'text', text: [{ text, styles: [] }], options });

const HELLO = message('Привет');
const BYE = message('Пока');

/** Часы теста: `now` двигает сам тест. */
const clock = () => {
  const time = { now: T0 };
  return { time, read: () => time.now };
};

const option = (n: number, label = `Вариант ${n}`): MessageOption => ({
  ref: `r${n}`,
  label,
});

describe('MemoryMessenger — наборы возможностей', () => {
  test('editing — правит, вариантов много, писать первым можно всегда', () => {
    const { name, community, ...rest } = MemoryMessenger.editing().capabilities;

    expect(name.length).toBeGreaterThan(0);
    expect(rest).toStrictEqual({
      kinds: ['text'],
      edit: true,
      text: { max: 4096, unit: 'utf16' },
      textWithOptions: { max: 4096, unit: 'utf16' },
      options: { max: 100, label: { max: 64, unit: 'grapheme' }, ref: 64 },
      pressAnswer: { max: 200, unit: 'utf16' },
      form: false,
      initiative: { kind: 'always' },
    });
    expect([...community.signals].sort()).toEqual([
      'added',
      'joined',
      'left',
      'removed',
    ]);
    expect([...community.operations].sort()).toEqual([
      'approve',
      'exclude',
      'invite',
      'inviteLink',
    ]);
  });

  test('windowed — не правит, три варианта, окно инициативы на сутки', () => {
    const { name, ...rest } = MemoryMessenger.windowed(() => T0).capabilities;

    expect(name.length).toBeGreaterThan(0);
    expect(rest).toStrictEqual({
      kinds: ['text'],
      edit: false,
      text: { max: 4096, unit: 'codePoint' },
      textWithOptions: { max: 1024, unit: 'codePoint' },
      options: { max: 3, label: { max: 20, unit: 'grapheme' }, ref: 256 },
      form: false,
      initiative: { kind: 'window', ms: DAY },
      community: { signals: [], operations: [] },
    });
  });

  test('возможности, переданные в конструктор, — те же', () => {
    const capabilities = MemoryMessenger.editing().capabilities;

    expect(new MemoryMessenger({ capabilities }).capabilities).toBe(
      capabilities,
    );
  });
});

describe('MemoryMessenger — показ и правка', () => {
  test('show выдаёт handle и пишет sent', async () => {
    const port = MemoryMessenger.editing();

    expect(await port.show(A, HELLO)).toEqual(ok('m1'));
    expect(port.journal).toEqual([
      { op: 'sent', via: 'show', peer: A, handle: 'm1', message: HELLO },
    ]);
  });

  test('editing: update показанного сообщения — правка на месте, тот же handle', async () => {
    const port = MemoryMessenger.editing();
    await port.show(A, HELLO);

    expect(await port.update(A, 'm1', BYE)).toEqual(
      ok({ handle: 'm1', edited: true }),
    );
    expect(port.journal.at(-1)).toEqual({
      op: 'edited',
      peer: A,
      handle: 'm1',
      message: BYE,
    });
  });

  test('editing: update неизвестного handle — новое сообщение и edited: false', async () => {
    const port = MemoryMessenger.editing();
    await port.show(A, HELLO);

    expect(await port.update(A, 'm9', BYE)).toEqual(
      ok({ handle: 'm2', edited: false }),
    );
    expect(port.journal.at(-1)).toEqual({
      op: 'sent',
      via: 'update',
      peer: A,
      handle: 'm2',
      message: BYE,
    });
  });

  test('editing: update чужого handle другого собеседника — новое сообщение', async () => {
    const port = MemoryMessenger.editing();
    await port.show(A, HELLO);

    expect(await port.update(B, 'm1', BYE)).toEqual(
      ok({ handle: 'm2', edited: false }),
    );
    expect(port.journal.at(-1)).toMatchObject({ op: 'sent', peer: B });
  });

  test('windowed: update — всегда новое сообщение, прежнее остаётся в журнале', async () => {
    const port = MemoryMessenger.windowed(() => T0);
    await port.show(A, HELLO);

    expect(await port.update(A, 'm1', BYE)).toEqual(
      ok({ handle: 'm2', edited: false }),
    );
    expect(port.journal).toEqual([
      { op: 'sent', via: 'show', peer: A, handle: 'm1', message: HELLO },
      { op: 'sent', via: 'update', peer: A, handle: 'm2', message: BYE },
    ]);
  });

  test('handle уникальны между собеседниками — сквозной счётчик', async () => {
    const port = MemoryMessenger.editing();

    const handles = [
      await port.show(A, HELLO),
      await port.show(B, HELLO),
      await port.notify(A, HELLO),
    ];

    expect(handles).toEqual([ok('m1'), ok('m2'), ok('m3')]);
  });
});

describe('MemoryMessenger — снятие вариантов и ответ на нажатие', () => {
  test('editing: retire пишет retired с нажатым вариантом', async () => {
    const port = MemoryMessenger.editing();
    const asked = message('Выбери', [option(1), option(2)]);
    await port.show(A, asked);

    expect(await port.retire(A, 'm1', asked, 'r2')).toEqual(ok());
    expect(port.journal.at(-1)).toEqual({
      op: 'retired',
      peer: A,
      handle: 'm1',
      message: asked,
      chosen: 'r2',
    });
  });

  test('editing: retire без нажатого — запись без поля chosen', async () => {
    const port = MemoryMessenger.editing();
    await port.show(A, HELLO);

    await port.retire(A, 'm1', HELLO);

    expect(port.journal.at(-1)).toStrictEqual({
      op: 'retired',
      peer: A,
      handle: 'm1',
      message: HELLO,
    });
  });

  test('windowed: retire — ok без записи', async () => {
    const port = MemoryMessenger.windowed(() => T0);
    await port.show(A, HELLO);

    expect(await port.retire(A, 'm1', HELLO, 'r1')).toEqual(ok());
    expect(port.journal).toHaveLength(1);
  });

  test('editing: answer пишет answered с текстом', async () => {
    const port = MemoryMessenger.editing();

    expect(await port.answer(A, 'press-1', 'Принято')).toEqual(ok());
    expect(port.journal).toEqual([
      { op: 'answered', peer: A, press: 'press-1', text: 'Принято' },
    ]);
  });

  test('editing: answer без текста — запись без поля text', async () => {
    const port = MemoryMessenger.editing();

    await port.answer(A, 'press-1');

    expect(port.journal).toStrictEqual([
      { op: 'answered', peer: A, press: 'press-1' },
    ]);
  });

  test('windowed: answer — ok без записи', async () => {
    const port = MemoryMessenger.windowed(() => T0);

    expect(await port.answer(A, 'press-1', 'Принято')).toEqual(ok());
    expect(port.journal).toEqual([]);
  });
});

describe('MemoryMessenger — окно инициативы', () => {
  test('инициатива до контакта — window с записью undelivered', async () => {
    const port = MemoryMessenger.windowed(clock().read);

    expect(await port.show(A, HELLO, { initiative: true })).toEqual(
      err({ reason: 'window' }),
    );
    expect(await port.update(A, 'm1', HELLO, { initiative: true })).toEqual(
      err({ reason: 'window' }),
    );
    expect(port.journal).toEqual([
      { op: 'undelivered', via: 'show', peer: A, reason: 'window' },
      { op: 'undelivered', via: 'update', peer: A, reason: 'window' },
    ]);
  });

  test('notify — всегда по инициативе: до контакта window', async () => {
    const port = MemoryMessenger.windowed(clock().read);

    expect(await port.notify(A, HELLO)).toEqual(err({ reason: 'window' }));
    expect(port.journal).toEqual([
      { op: 'undelivered', via: 'notify', peer: A, reason: 'window' },
    ]);
  });

  test('после heard инициатива проходит', async () => {
    const port = MemoryMessenger.windowed(clock().read);
    port.heard(A);

    expect(await port.show(A, HELLO, { initiative: true })).toEqual(ok('m1'));
    expect(await port.notify(A, HELLO)).toEqual(ok('m2'));
  });

  test('ответ без признака инициативы проходит всегда и открывает окно', async () => {
    const port = MemoryMessenger.windowed(clock().read);

    expect(await port.show(A, HELLO)).toEqual(ok('m1'));
    expect(await port.notify(A, BYE)).toEqual(ok('m2'));
  });

  test('окно открыто строго меньше ms от последнего контакта', async () => {
    const { time, read } = clock();
    const port = MemoryMessenger.windowed(read);
    port.heard(A);

    time.now = T0 + DAY - 1;
    expect(await port.notify(A, HELLO)).toEqual(ok('m1'));

    time.now = T0 + DAY;
    expect(await port.notify(A, HELLO)).toEqual(err({ reason: 'window' }));
  });

  test('после сдвига часов на окно — window, новый heard открывает снова', async () => {
    const { time, read } = clock();
    const port = MemoryMessenger.windowed(read);
    await port.show(A, HELLO);

    time.now = T0 + DAY;
    expect(await port.show(A, BYE, { initiative: true })).toEqual(
      err({ reason: 'window' }),
    );

    port.heard(A);
    expect(await port.show(A, BYE, { initiative: true })).toEqual(ok('m2'));
  });

  test('окно у каждого собеседника своё', async () => {
    const port = MemoryMessenger.windowed(clock().read);
    port.heard(A);

    expect(await port.notify(B, HELLO)).toEqual(err({ reason: 'window' }));
    expect(await port.notify(A, HELLO)).toEqual(ok('m1'));
  });

  test('editing (always): notify без контакта проходит', async () => {
    const port = MemoryMessenger.editing();

    expect(await port.notify(A, HELLO)).toEqual(ok('m1'));
    expect(port.journal).toEqual([
      { op: 'sent', via: 'notify', peer: A, handle: 'm1', message: HELLO },
    ]);
  });

  test('afterContact: закрыто до первого контакта, потом всегда', async () => {
    const { time, read } = clock();
    const capabilities: MessengerCapabilities = {
      ...MemoryMessenger.windowed(read).capabilities,
      initiative: { kind: 'afterContact' },
    };
    const port = new MemoryMessenger({ capabilities, clock: read });

    expect(await port.notify(A, HELLO)).toEqual(err({ reason: 'window' }));

    port.heard(A);
    time.now = T0 + 365 * DAY;

    expect(await port.notify(A, HELLO)).toEqual(ok('m1'));
    expect(await port.notify(B, HELLO)).toEqual(err({ reason: 'window' }));
  });

  test('afterContact: ответ тоже считается контактом', async () => {
    const capabilities: MessengerCapabilities = {
      ...MemoryMessenger.windowed(() => T0).capabilities,
      initiative: { kind: 'afterContact' },
    };
    const port = new MemoryMessenger({ capabilities, clock: () => T0 });

    await port.show(A, HELLO);

    expect(await port.notify(A, BYE)).toEqual(ok('m2'));
  });
});

describe('MemoryMessenger — строгость к лимитам', () => {
  const rejected = (via: 'show' | 'update' | 'retire' | 'answer' | 'notify') =>
    ({ op: 'undelivered', via, peer: A, reason: 'rejected' }) as const;

  test.each([
    [
      'лишний вариант',
      message(
        'Выбери',
        [1, 2, 3, 4].map((n) => option(n)),
      ),
    ],
    ['текст с вариантами длиннее 1024', message('a'.repeat(1025), [option(1)])],
    ['текст без вариантов длиннее 4096', message('a'.repeat(4097))],
    [
      'подпись длиннее 20 графем',
      message('Выбери', [option(1, 'д'.repeat(21))]),
    ],
    [
      'ссылка длиннее 256',
      message('Выбери', [{ ref: 'r'.repeat(257), label: 'Да' }]),
    ],
    ['пустой текст без вариантов', { kind: 'text', text: [], options: [] }],
  ] as const)(
    'windowed: %s — rejected с записью undelivered',
    async (_, bad) => {
      const port = MemoryMessenger.windowed(() => T0);

      expect(await port.show(A, bad)).toEqual(err({ reason: 'rejected' }));
      expect(port.journal).toEqual([rejected('show')]);
    },
  );

  test('ровно на пределах — доставлено', async () => {
    const port = MemoryMessenger.windowed(() => T0);
    const edge = message('a'.repeat(1024), [
      { ref: 'r'.repeat(256), label: 'д'.repeat(20) },
      option(2),
      option(3),
    ]);

    expect(await port.show(A, edge)).toEqual(ok('m1'));
  });

  test('пустой текст с вариантами — доставлено', async () => {
    const port = MemoryMessenger.windowed(() => T0);

    expect(
      await port.show(A, { kind: 'text', text: [], options: [option(1)] }),
    ).toEqual(ok('m1'));
  });

  test.each([
    ['update', (p: MemoryMessenger, m: Message) => p.update(A, 'm1', m)],
    ['retire', (p: MemoryMessenger, m: Message) => p.retire(A, 'm1', m)],
    ['notify', (p: MemoryMessenger, m: Message) => p.notify(A, m)],
  ] as const)(
    'editing: %s сверх лимита подписи — rejected',
    async (via, call) => {
      const port = MemoryMessenger.editing();

      expect(
        await call(port, message('Выбери', [option(1, 'д'.repeat(65))])),
      ).toEqual(err({ reason: 'rejected' }));
      expect(port.journal).toEqual([rejected(via)]);
    },
  );

  test('editing: answer длиннее pressAnswer — rejected', async () => {
    const port = MemoryMessenger.editing();

    expect(await port.answer(A, 'press-1', 'a'.repeat(201))).toEqual(
      err({ reason: 'rejected' }),
    );
    expect(port.journal).toEqual([rejected('answer')]);
  });

  test('на ожидаемые случаи не бросает', async () => {
    const port = MemoryMessenger.windowed(() => T0);
    const huge = message('Выбери', [
      { ref: 'r'.repeat(1000), label: 'д'.repeat(100) },
    ]);

    await expect(port.show(A, huge)).resolves.toEqual(
      err({ reason: 'rejected' }),
    );
    await expect(port.notify(B, HELLO)).resolves.toEqual(
      err({ reason: 'window' }),
    );
  });
});

describe('MemoryMessenger.chat — беседа глазами собеседника', () => {
  test('сообщения по порядку появления с последним содержимым и числом правок', async () => {
    const port = MemoryMessenger.editing();
    const asked = message('Выбери', [option(1)]);
    await port.show(A, HELLO);
    await port.show(A, asked);
    await port.update(A, 'm1', BYE);
    await port.update(A, 'm1', asked);

    const lines: readonly ChatLine[] = port.chat(A);

    expect(lines).toStrictEqual([
      { handle: 'm1', message: asked, edits: 2, retired: false },
      { handle: 'm2', message: asked, edits: 0, retired: false },
    ]);
  });

  test('уход сообщения — признак и ссылка нажатого; без нажатого — без поля chosen', async () => {
    const port = MemoryMessenger.editing();
    const asked = message('Выбери', [option(1), option(2)]);
    await port.show(A, asked);
    await port.show(A, asked);
    await port.retire(A, 'm1', asked, 'r2');
    await port.retire(A, 'm2', asked);

    expect(port.chat(A)).toStrictEqual([
      { handle: 'm1', message: asked, edits: 0, retired: true, chosen: 'r2' },
      { handle: 'm2', message: asked, edits: 0, retired: true },
    ]);
  });

  test('собеседники раздельны: у каждого свои сообщения, правки и уход', async () => {
    const port = MemoryMessenger.editing();
    await port.show(A, HELLO);
    await port.show(B, HELLO);
    await port.update(B, 'm2', BYE);
    await port.retire(A, 'm1', HELLO);

    expect(port.chat(A)).toStrictEqual([
      { handle: 'm1', message: HELLO, edits: 0, retired: true },
    ]);
    expect(port.chat(B)).toStrictEqual([
      { handle: 'm2', message: BYE, edits: 1, retired: false },
    ]);
    expect(port.chat('peer-c')).toEqual([]);
  });

  test('windowed: update — новая строка, прежняя без правок; retire ухода не отмечает', async () => {
    const port = MemoryMessenger.windowed(() => T0);
    await port.show(A, HELLO);
    await port.update(A, 'm1', BYE);
    await port.retire(A, 'm1', HELLO, 'r1');

    expect(port.chat(A)).toStrictEqual([
      { handle: 'm1', message: HELLO, edits: 0, retired: false },
      { handle: 'm2', message: BYE, edits: 0, retired: false },
    ]);
  });

  test('уведомление — строка беседы; недоставка и ответ на нажатие строк не дают', async () => {
    const port = MemoryMessenger.editing();
    await port.notify(A, HELLO);
    port.failNext('unavailable');
    await port.show(A, BYE);
    await port.answer(A, 'press-1', 'Принято');

    expect(port.chat(A)).toStrictEqual([
      { handle: 'm1', message: HELLO, edits: 0, retired: false },
    ]);
  });
});

describe('MemoryMessenger — failNext', () => {
  test('одна недоставка с заданной причиной, затем как обычно', async () => {
    const port = MemoryMessenger.editing();
    port.failNext('unavailable');

    expect(await port.show(A, HELLO)).toEqual(err({ reason: 'unavailable' }));
    expect(await port.show(A, HELLO)).toEqual(ok('m1'));
    expect(port.journal).toEqual([
      { op: 'undelivered', via: 'show', peer: A, reason: 'unavailable' },
      { op: 'sent', via: 'show', peer: A, handle: 'm1', message: HELLO },
    ]);
  });

  test.each(['window', 'blocked', 'rejected', 'unavailable'] as const)(
    'причина %s отдаётся как задана',
    async (reason) => {
      const port = MemoryMessenger.editing();
      port.failNext(reason);

      expect(await port.answer(A, 'press-1', 'Принято')).toEqual(
        err({ reason }),
      );
      expect(port.journal).toEqual([
        { op: 'undelivered', via: 'answer', peer: A, reason },
      ]);
    },
  );
});
