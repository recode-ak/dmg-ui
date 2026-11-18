import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import {
  ASSIGNED_ID,
  exampleCodes,
  MemoryUiObserver,
  TASK_A,
  TASK_B,
  TaskCardScreenDef,
} from 'dmg-ui/testing';
import {
  ExamplePagesAppDef,
  examplePageRoutes,
  examplePageViews,
} from '../../testing';
import type {
  ClientMessage as ClientMsg,
  ServerMessage as ServerMsg,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import { PageClient } from './page-client';
import type { PagePlacement } from './page-client.types';
import { PageText } from './page-text';

// Текстовая страница вкладки — подставная цель показа для тестов: текстовое
// представление на `main`, `side` и `modal`, склейка областей через `---` и входящие
// вкладки. После `close()` текст больше не меняется.

const TASKS = [
  { uuid: TASK_A, title: 'Хлеб', status: 'open' },
  { uuid: TASK_B, title: 'Молоко', status: 'open' },
  { uuid: testUuid(3), title: 'Сыр', status: 'open' },
];

/** Конец провода: на любой `call` — задачи следующей микрозадачей. */
class StubEnd implements ClientEnd {
  readonly context = {
    locale: 'ru-RU',
    timeZone: 'Asia/Oral',
    delegate: false,
    readOnly: false,
  };
  private readonly handlers: ((message: ServerMsg) => void)[] = [];

  onMessage(handler: (message: ServerMsg) => void): void {
    this.handlers.push(handler);
  }

  onBreak(): void {}

  send(message: ClientMsg): void {
    if (message.kind !== 'call') return;
    Promise.resolve().then(() =>
      this.emit({ kind: 'result', id: message.id, result: ok(TASKS) }),
    );
  }

  close(): void {}

  emit(message: ServerMsg): void {
    for (const handler of this.handlers) handler(message);
  }

  /** Отдаёт ответы заглушки и реакции клиента без таймеров (TST-04). */
  async flush(): Promise<void> {
    for (let turn = 0; turn < 200; turn += 1) await Promise.resolve();
  }
}

const page = (placements?: readonly PagePlacement[]) => {
  const end = new StubEnd();
  const client = new PageClient({
    app: ExamplePagesAppDef,
    codes: exampleCodes(),
    routes: examplePageRoutes,
    end,
    observer: new MemoryUiObserver(),
    ...(placements === undefined ? {} : { placements }),
  });
  return { end, client, text: new PageText(client, examplePageViews) };
};

describe('PageText', () => {
  test('page() — области через «---», затем «Входящие» по входящим вкладки', async () => {
    const { end, client, text } = page();
    await client.route('/');
    await client.submit('main', 'open', { taskId: 'Молоко' });
    end.emit({
      kind: 'notification',
      notification: 'exampleUi/todo/taskAssigned',
      data: { title: 'Сыр' },
      links: [{ screen: ASSIGNED_ID, params: {} }],
      eventId: 'e-1',
    });
    await end.flush();

    expect(text.region('main')).toContain('Мои задачи');
    expect(text.region('side')).toContain('Молоко');
    expect(text.page()).toBe(
      [
        text.region('main'),
        text.region('side'),
        'Входящие\n- Вам назначена задача: Сыр',
      ].join('\n\n---\n\n'),
    );
  });

  test('пустая область и пустые входящие в page() опускаются', async () => {
    const { client, text } = page();

    await client.route('/');

    expect(text.region('side')).toBe('');
    expect(text.page()).toBe(text.region('main'));
  });

  test('после close() смена области текст не меняет', async () => {
    const { client, text } = page();
    await client.route('/');
    const before = text.page();

    text.close();
    await client.submit('main', 'next', {});

    expect(client.region('main').view?.address).toMatchObject({
      params: { page: 1 },
    });
    expect(text.page()).toBe(before);
  });
});

describe('PageText — три области', () => {
  const CARD_IN_MODAL: readonly PagePlacement[] = [
    { screen: TaskCardScreenDef, region: 'modal' },
  ];

  /** Список в `main`, поручения в `side`, карточка Молока в `modal`. */
  const threeRegions = async () => {
    const t = page(CARD_IN_MODAL);
    await t.client.route('/');
    await t.client.openLink({ screen: ASSIGNED_ID, params: {} });
    await t.client.submit('main', 'open', { taskId: 'Молоко' });
    return t;
  };

  test('page() — main, side, modal через «---» в этом порядке', async () => {
    const { client, text } = await threeRegions();

    expect(client.region('modal').view?.data).toMatchObject({
      title: 'Молоко',
    });
    expect(text.region('main')).toContain('Мои задачи');
    expect(text.region('side')).toContain('Назначенные мне');
    expect(text.region('modal')).toContain('Молоко');
    expect(text.page()).toBe(
      [text.region('main'), text.region('side'), text.region('modal')].join(
        '\n\n---\n\n',
      ),
    );
  });

  test('пустая средняя область опускается: main и modal через «---»', async () => {
    const { client, text } = page(CARD_IN_MODAL);
    await client.route('/');
    await client.submit('main', 'open', { taskId: 'Молоко' });

    expect(text.region('side')).toBe('');
    expect(text.page()).toBe(
      [text.region('main'), text.region('modal')].join('\n\n---\n\n'),
    );
  });

  test('region(modal) — текст окна; пустое окно — пустая строка', async () => {
    const { client, text } = page(CARD_IN_MODAL);
    await client.route('/');

    expect(text.region('modal')).toBe('');

    await client.submit('main', 'open', { taskId: 'Молоко' });

    expect(text.region('modal')).toContain('Молоко');

    client.close('modal');

    expect(text.region('modal')).toBe('');
  });

  test('после close() окно текст не меняет', async () => {
    const { client, text } = await threeRegions();
    const before = text.page();

    text.close();
    client.close('modal');

    expect(text.page()).toBe(before);
  });
});
