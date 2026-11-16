import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  CodeLoader,
  CodeLoaders,
  type FieldChoices,
  ScreenCode,
  ScreenDef,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { RuntimeKit, testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger, type MessengerEntry } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogReplies } from '../dialog/dialog-replies';
import { DialogTraces } from '../dialog/dialog-traces';
import { DialogViews, ScreenPresenter } from '../dialog/dialog-views';
import { PlainText } from '../message/plain-text';
import { LimitedMessenger } from '../messenger/limited-messenger';
import { Conversation } from './conversation';
import type {
  ConversationSignal,
  ConversationSnapshot,
} from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';

// Сбор входа беседы сверх того, что проверяют тесты фасада диалога (шаги,
// выбор нажатием и подписью, «Пропустить», повтор по `rejected`, свободный
// текст основному действию): варианты сверх лимита мессенджера, выбор
// номером, отмена, черновик в снимке, вложение и текст отвергнутого входа.
// Беседа — на исполнителе с заглушками и локальными Def; мессенджер — за
// стражем лимитов, как у узла бесед, лог стража и беседы — один.

const A = testUuid(1);
const B = testUuid(2);
const PEER_A = 'peer-a';
const PEER_B = 'peer-b';

const KINDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;
const KIND_LABELS = [
  'Первый',
  'Второй',
  'Третий',
  'Четвёртый',
  'Пятый',
  'Шестой',
  'Седьмой',
] as const;
const SIZES = ['s', 'm', 'l', 'x'] as const;
const SIZE_LABELS = ['Малый', 'Средний', 'Большой', 'Огромный'] as const;

/**
 * Форма: обязательное поле с семью вариантами, необязательное с четырьмя и
 * необязательный текст; длинную заметку схема отвергает замечанием, которое
 * повторяет введённое.
 */
const FormScreenDef = ScreenDef.define({
  name: 'form',
  label: 'Форма',
  description: 'Действие с тремя полями входа.',
  reads: [],
  data: v.object({}),
  actions: {
    send: {
      label: 'Отправить',
      description: 'Собирает три поля и остаётся на экране.',
      input: v.object({
        kind: v.pipe(v.picklist(KINDS), v.description('Вид')),
        size: v.optional(v.pipe(v.picklist(SIZES), v.description('Размер'))),
        note: v.optional(
          v.pipe(
            v.string(),
            v.maxLength(8, (issue) => `Не длиннее 8 знаков: ${issue.input}`),
            v.description('Заметка'),
          ),
        ),
      }),
    },
  },
});

/** Меню: пять действий без полей — больше, чем помещается на `windowed`. */
const MenuScreenDef = ScreenDef.define({
  name: 'menu',
  label: 'Меню',
  description: 'Пять действий без полей.',
  reads: [],
  data: v.object({}),
  actions: {
    one: { label: 'Пункт 1', description: 'Первый пункт.' },
    two: { label: 'Пункт 2', description: 'Второй пункт.' },
    three: { label: 'Пункт 3', description: 'Третий пункт.' },
    four: { label: 'Пункт 4', description: 'Четвёртый пункт.' },
    five: { label: 'Пункт 5', description: 'Пятый пункт.' },
  },
});

/** Что дошло до кода экранов: собранные входы формы и нажатые пункты меню. */
type Calls = {
  readonly inputs: unknown[];
  readonly pressed: string[];
};

class FormCode extends ScreenCode<typeof FormScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof FormScreenDef>> = {
    send: {
      done: ({ input }) => {
        this.calls.inputs.push(input);
        return FormScreenDef.at({});
      },
    },
  };

  constructor(private readonly calls: Calls) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override choices(name: string): FieldChoices {
    if (name !== 'send') return {};
    return {
      kind: KINDS.map((value, i) => ({ value, label: KIND_LABELS[i] ?? '' })),
      size: SIZES.map((value, i) => ({ value, label: SIZE_LABELS[i] ?? '' })),
    };
  }
}

class MenuCode extends ScreenCode<typeof MenuScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof MenuScreenDef>> = {
    one: { done: () => this.stay('one') },
    two: { done: () => this.stay('two') },
    three: { done: () => this.stay('three') },
    four: { done: () => this.stay('four') },
    five: { done: () => this.stay('five') },
  };

  constructor(private readonly calls: Calls) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  private stay(name: string) {
    this.calls.pressed.push(name);
    return MenuScreenDef.at({});
  }
}

const InputSetDef = UiSetDef.define({
  name: 'inputUi',
  label: 'Набор сбора входа',
  description: 'Локальные экраны сбора входа беседы.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'input',
      label: 'Сбор входа',
      description: 'Форма и меню.',
      screens: [FormScreenDef, MenuScreenDef],
      stories: [],
    }),
  ],
});

const InputAppDef = UiAppDef.define({
  name: 'inputDialog',
  label: 'Сбор входа',
  description: 'Приложение UI локальных экранов сбора входа.',
  set: InputSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Форма',
      description: 'Форма с тремя полями.',
      address: FormScreenDef.at({}),
    },
    menu: {
      label: 'Меню',
      description: 'Пять действий.',
      address: MenuScreenDef.at({}),
    },
  },
});

const views = DialogViews.of(InputSetDef, [
  ScreenPresenter.for(FormScreenDef, () => 'Форма'),
  ScreenPresenter.for(MenuScreenDef, () => 'Меню'),
]);

type ConversationOptions = {
  readonly messenger: MemoryMessenger;
  readonly peer?: string;
  readonly person?: string;
  readonly snapshot?: ConversationSnapshot;
};

/**
 * Мир теста: код экранов пишет в общий `calls`, лог, эпохи ссылок и id
 * сигналов — общие на все беседы и воплощения. Каждая беседа — на своём
 * исполнителе: новая беседа из снимка — «перезапуск».
 */
const worldOf = () => {
  const calls: Calls = { inputs: [], pressed: [] };
  const logger = new MemoryLogger();
  let requests = 0;
  let epochs = 0;
  let ids = 0;

  const conversationOf = (options: ConversationOptions) => {
    const peer = options.peer ?? PEER_A;
    const kit = new RuntimeKit(
      CodeLoaders.of(InputSetDef, [
        CodeLoader.screen(FormScreenDef, async () => new FormCode(calls)),
        CodeLoader.screen(MenuScreenDef, async () => new MenuCode(calls)),
      ]),
      InputSetDef,
    );
    const conversation = new Conversation(
      {
        app: InputAppDef,
        runtime: kit.runtime,
        contexts: { context: async () => testRenderContext },
        traces: new DialogTraces(() => {
          requests += 1;
          return `r-${requests}`;
        }),
        replies: new DialogReplies(views),
        messenger: new LimitedMessenger({ port: options.messenger, logger }),
        logger,
        peer,
        person: options.person ?? A,
        home: 'start',
        epochs: () => {
          epochs += 1;
          return `ep${String(epochs).padStart(3, '0')}`;
        },
      },
      options.snapshot,
    );
    const head = () => {
      ids += 1;
      return { id: `s-${ids}`, peer, sender: `sender-${peer}` };
    };
    const signals = {
      enter: (entry: string): ConversationSignal => ({
        ...head(),
        kind: 'enter',
        entry,
      }),
      text: (text: string): ConversationSignal => ({
        ...head(),
        kind: 'text',
        text,
      }),
      press: (ref: string): ConversationSignal => ({
        ...head(),
        kind: 'press',
        ref,
        press: `p-${ids}`,
      }),
      cancel: (): ConversationSignal => ({ ...head(), kind: 'cancel' }),
      attachment: (): ConversationSignal => ({
        ...head(),
        kind: 'attachment',
        attachment: { kind: 'file', handle: 'h-1' },
      }),
    };
    return { conversation, signals };
  };

  return { calls, logger, conversationOf };
};

type Sent = Extract<MessengerEntry, { op: 'sent' }>;

const sent = (messenger: MemoryMessenger, peer: string = PEER_A): Sent[] =>
  messenger.journal.filter(
    (entry): entry is Sent => entry.op === 'sent' && entry.peer === peer,
  );

const lastSent = (messenger: MemoryMessenger, peer: string = PEER_A): Sent => {
  const entry = sent(messenger, peer).at(-1);
  if (entry === undefined) throw new Error('сообщений нет');
  return entry;
};

const text = (entry: Sent) => PlainText.of(entry.message.text);

const labels = (entry: Sent) => entry.message.options.map((o) => o.label);

/** Ссылка варианта `label` из самого свежего сообщения собеседника, где он есть. */
const refOf = (
  messenger: MemoryMessenger,
  label: string,
  peer: string = PEER_A,
): string => {
  for (const entry of [...sent(messenger, peer)].reverse()) {
    const option = entry.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

const undelivered = (messenger: MemoryMessenger) =>
  messenger.journal.filter((entry) => entry.op === 'undelivered');

const errors = (logger: MemoryLogger) =>
  logger.records.filter((record) => record.level === 'error');

describe('Conversation — варианты сверх лимита мессенджера', () => {
  test('варианты поля сверх лимита — листание «Ещё» по кругу на windowed, каждое сообщение ≤ 3 вариантов', async () => {
    const w = worldOf();
    const messenger = MemoryMessenger.windowed(() => 0);
    const { conversation, signals } = w.conversationOf({ messenger });
    await conversation.receive(signals.enter('start'));
    await conversation.receive(signals.press(refOf(messenger, 'Отправить')));

    for (let turn = 0; turn < 4; turn += 1) {
      await conversation.receive(signals.press(refOf(messenger, 'Ещё')));
    }
    const pages = sent(messenger).slice(1);
    await conversation.receive(signals.press(refOf(messenger, 'Пятый')));

    expect(pages.map(text)).toEqual(Array(5).fill('Выберите: Вид'));
    expect(pages.map(labels)).toEqual([
      ['Первый', 'Второй', 'Ещё'],
      ['Третий', 'Четвёртый', 'Ещё'],
      ['Пятый', 'Шестой', 'Ещё'],
      ['Седьмой', 'Ещё'],
      ['Первый', 'Второй', 'Ещё'],
    ]);
    for (const entry of sent(messenger)) {
      expect(entry.message.options.length).toBeLessThanOrEqual(3);
    }
    expect(conversation.snapshot().draft).toMatchObject({
      values: { kind: 'e' },
      answered: ['kind'],
      page: 0,
    });
    expect(text(lastSent(messenger))).toStartWith('Выберите: Размер');
    expect(undelivered(messenger)).toEqual([]);
    expect(errors(w.logger)).toEqual([]);
    expect(w.calls.inputs).toEqual([]);
  });

  test('выбор номером на windowed — «2» заполняет поле вторым вариантом', async () => {
    const w = worldOf();
    const messenger = MemoryMessenger.windowed(() => 0);
    const { conversation, signals } = w.conversationOf({ messenger });
    await conversation.receive(signals.enter('start'));
    await conversation.receive(signals.press(refOf(messenger, 'Отправить')));
    await conversation.receive(signals.press(refOf(messenger, 'Первый')));
    const numbered = lastSent(messenger);

    await conversation.receive(signals.text('2'));
    const next = lastSent(messenger);
    await conversation.receive(signals.press(refOf(messenger, 'Пропустить')));

    // Поле с «Пропустить» на трёх вариантах: номера в тексте, кнопка — одна.
    expect(text(numbered)).toBe(
      'Выберите: Размер\n\n1. Малый\n2. Средний\n3. Большой\n4. Огромный',
    );
    expect(labels(numbered)).toEqual(['Пропустить']);
    expect(text(next)).toBe('Введите: Заметка');
    expect(labels(next)).toEqual(['Пропустить']);
    expect(w.calls.inputs).toEqual([{ kind: 'a', size: 'm' }]);
    expect(errors(w.logger)).toEqual([]);
  });

  test('варианты экрана сверх лимита — листание; MessageFit ничего не отбрасывает (нет error в логе)', async () => {
    const w = worldOf();
    const messenger = MemoryMessenger.windowed(() => 0);
    const { conversation, signals } = w.conversationOf({ messenger });
    await conversation.receive(signals.enter('menu'));

    for (let turn = 0; turn < 3; turn += 1) {
      await conversation.receive(signals.press(refOf(messenger, 'Ещё')));
    }
    const pages = sent(messenger);
    await conversation.receive(signals.press(refOf(messenger, 'Пункт 5')));

    expect(pages.map(text)).toEqual(Array(4).fill('Меню'));
    expect(pages.map(labels)).toEqual([
      ['Пункт 1', 'Пункт 2', 'Ещё'],
      ['Пункт 3', 'Пункт 4', 'Ещё'],
      ['Пункт 5', 'Ещё'],
      ['Пункт 1', 'Пункт 2', 'Ещё'],
    ]);
    // Ссылка действия с прежней страницы того же показа — исполняется.
    expect(w.calls.pressed).toEqual(['five']);
    expect(errors(w.logger)).toEqual([]);
    expect(undelivered(messenger)).toEqual([]);
  });
});

describe('Conversation — черновик входа', () => {
  test('отмена посреди шагов — черновик сброшен, «Ввод отменён», ссылка прежнего шага — «Действие сейчас недоступно»', async () => {
    const w = worldOf();
    const messenger = MemoryMessenger.editing();
    const { conversation, signals } = w.conversationOf({ messenger });
    await conversation.receive(signals.enter('start'));
    await conversation.receive(signals.press(refOf(messenger, 'Отправить')));
    await conversation.receive(signals.press(refOf(messenger, 'Первый')));
    const small = refOf(messenger, 'Малый');

    await conversation.receive(signals.cancel());
    const cancelled = lastSent(messenger);
    const draft = conversation.snapshot().draft;
    await conversation.receive(signals.press(small));

    expect(text(cancelled)).toBe('Ввод отменён.\n\nФорма');
    expect(labels(cancelled)).toEqual(['Отправить']);
    expect(draft).toBeUndefined();
    expect(text(lastSent(messenger))).toBe('Действие сейчас недоступно.');
    expect(labels(lastSent(messenger))).toEqual([]);
    expect(w.calls.inputs).toEqual([]);
  });

  test('черновик переживает перезапуск: следующее поле, вход собран один раз', async () => {
    const w = worldOf();
    const before = MemoryMessenger.editing();
    const first = w.conversationOf({ messenger: before });
    await first.conversation.receive(first.signals.enter('start'));
    await first.conversation.receive(
      first.signals.press(refOf(before, 'Отправить')),
    );
    await first.conversation.receive(
      first.signals.press(refOf(before, 'Второй')),
    );
    const small = refOf(before, 'Малый');
    const saved = v.parse(
      ConversationSnapshotSchema,
      JSON.parse(JSON.stringify(first.conversation.snapshot())),
    );
    first.conversation.close();

    const after = MemoryMessenger.editing();
    const second = w.conversationOf({ messenger: after, snapshot: saved });
    await second.conversation.receive(second.signals.press(small));
    await second.conversation.receive(second.signals.text('к ужину'));

    expect(saved.draft).toMatchObject({
      screen: saved.screen?.serial,
      target: { kind: 'action', action: 'send' },
      values: { kind: 'b' },
      answered: ['kind'],
    });
    expect(saved.draft?.serial).toBeGreaterThan(saved.screen?.serial ?? 0);
    expect(saved.serial).toBeGreaterThanOrEqual(saved.draft?.serial ?? 0);
    const texts = sent(after).map(text);
    expect(texts[0]).toBe('Введите: Заметка');
    expect(texts.some((t) => t.includes('Экран обновился'))).toBe(false);
    expect(texts.some((t) => t.includes('недоступно'))).toBe(false);
    expect(w.calls.inputs).toEqual([{ kind: 'b', size: 's', note: 'к ужину' }]);
  });

  test('вложение при ожидании поля — заметка, поле ждёт', async () => {
    const w = worldOf();
    const messenger = MemoryMessenger.editing();
    const { conversation, signals } = w.conversationOf({ messenger });
    await conversation.receive(signals.enter('start'));
    await conversation.receive(signals.press(refOf(messenger, 'Отправить')));

    await conversation.receive(signals.attachment());
    const noted = lastSent(messenger);
    const draft = conversation.snapshot().draft;
    await conversation.receive(signals.text('Второй'));

    expect(text(noted)).toBe('Вложения здесь не принимаются.');
    expect(labels(noted)).toEqual([]);
    expect(draft).toMatchObject({ values: {}, answered: [] });
    expect(text(lastSent(messenger))).toBe('Выберите: Размер');
    expect(conversation.snapshot().draft?.values).toEqual({ kind: 'b' });
    expect(w.calls.inputs).toEqual([]);
  });

  test('текст отвергнутого входа — только в беседе автора: в журнале мессенджера своего собеседника, не в логе', async () => {
    const w = worldOf();
    const messenger = MemoryMessenger.editing();
    const a = w.conversationOf({ messenger });
    const b = w.conversationOf({ messenger, peer: PEER_B, person: B });
    await a.conversation.receive(a.signals.enter('start'));
    await a.conversation.receive(
      a.signals.press(refOf(messenger, 'Отправить')),
    );
    await a.conversation.receive(a.signals.press(refOf(messenger, 'Первый')));
    await a.conversation.receive(
      a.signals.press(refOf(messenger, 'Пропустить')),
    );
    await b.conversation.receive(b.signals.enter('start'));
    await b.conversation.receive(
      b.signals.press(refOf(messenger, 'Отправить', PEER_B)),
    );

    await a.conversation.receive(a.signals.text('mark-z9-secret'));
    await b.conversation.receive(
      b.signals.press(refOf(messenger, 'Второй', PEER_B)),
    );

    const repeated = lastSent(messenger);
    expect(text(repeated)).toBe(
      'Не длиннее 8 знаков: mark-z9-secret\n\nВведите: Заметка',
    );
    expect(labels(repeated)).toEqual(['Пропустить']);
    expect(sent(messenger, PEER_B).length).toBeGreaterThan(0);
    for (const entry of sent(messenger, PEER_B)) {
      expect(JSON.stringify(entry)).not.toContain('mark-z9');
    }
    expect(JSON.stringify(w.logger.records)).not.toContain('mark-z9');
    expect(w.calls.inputs).toEqual([]);
  });
});
