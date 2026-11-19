import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  Availability,
  CodeLoader,
  CodeLoaders,
  ScreenCode,
  ScreenDef,
  type StateOf,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { RuntimeKit, testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogTraces } from '../dialog/dialog-traces';
import { PlainText } from '../message/plain-text';
import { TextBuilder } from '../message/text-builder';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import { MAX_LABEL_LENGTH, MAX_NAME_LENGTH } from './conversation.const';
import type { ConversationSnapshot, RefEntry } from './conversation.types';
import { ConversationSnapshotSchema } from './conversation-snapshot';
import { RefTable } from './ref-table';
import { ScreenFingerprint } from './screen-fingerprint';

// Запись `disabled` таблицы ссылок и снимок беседы: запись проходит схему и
// круг JSON; причины в ней нет; прежний снимок (без записей `disabled`)
// читается, ссылки действий после восстановления — на новой ревизии;
// снимок с записью `disabled` оживает как есть. Внешние данные: мусор — не по
// схеме, без броска.

const PEER = 'peer-a';
const A = testUuid(1);
const MARK = '🚫';
const FIRE = `${MARK} Пуск`;
const NEED = 'Нужно отметок';

const BARE: ConversationSnapshot = {
  version: 1,
  person: '00000000-0000-4000-8000-000000000001',
  serial: 2,
  refs: [],
  seen: [],
};

const DISABLED: RefEntry = {
  ref: 'abcde1',
  kind: 'disabled',
  screen: 2,
  name: 'fire',
  label: FIRE,
};

const valid = (value: unknown) =>
  v.safeParse(ConversationSnapshotSchema, value).success;

const withRef = (entry: unknown) => ({ ...BARE, refs: [entry] });

describe('ConversationSnapshotSchema — запись disabled', () => {
  test('запись проходит схему и круг JSON без потерь', () => {
    const value = withRef(DISABLED);
    const round = JSON.parse(JSON.stringify(value));

    expect(round).toStrictEqual(value);
    expect<unknown>(v.parse(ConversationSnapshotSchema, round)).toStrictEqual(
      value,
    );
  });

  test('имя и подпись ровно в пределе — по схеме', () => {
    const name = 'н'.repeat(MAX_NAME_LENGTH);
    const label = 'п'.repeat(MAX_LABEL_LENGTH);

    expect(valid(withRef({ ...DISABLED, name, label }))).toBe(true);
  });

  test('причины в записи нет: лишнее поле схема отбрасывает', () => {
    const parsed = v.parse(
      ConversationSnapshotSchema,
      withRef({ ...DISABLED, reason: 'Нужно отметок: 3' }),
    );

    expect(parsed.refs).toStrictEqual([DISABLED]);
  });

  test.each<[string, Record<string, unknown>]>([
    ['name длиннее MAX_NAME_LENGTH', { name: 'н'.repeat(MAX_NAME_LENGTH + 1) }],
    [
      'label длиннее MAX_LABEL_LENGTH',
      { label: 'п'.repeat(MAX_LABEL_LENGTH + 1) },
    ],
    ['screen не целый', { screen: 1.5 }],
    ['screen отрицательный', { screen: -1 }],
    ['name не строка', { name: 7 }],
    ['нет name', { name: undefined }],
    ['нет screen', { screen: undefined }],
    ['ссылка не по шаблону', { ref: 'ABC-1' }],
  ])('%s — не по схеме, без броска', (_, patch) => {
    expect(valid(withRef(DISABLED))).toBe(true);

    expect(valid(withRef({ ...DISABLED, ...patch }))).toBe(false);
  });
});

describe('RefTable — запись disabled', () => {
  test('rebase запись disabled не меняет, соседнюю запись действия переносит', () => {
    const refs = new RefTable('abcde');
    const fire = refs.add({
      kind: 'disabled',
      screen: 1,
      name: 'fire',
      label: FIRE,
    });
    const stay = refs.add({
      kind: 'action',
      screen: 1,
      revision: 3,
      action: 'stay',
      label: 'Остаться',
    });

    refs.rebase(1, 3, 4);

    expect(refs.entry(fire)).toEqual({
      ref: fire,
      kind: 'disabled',
      screen: 1,
      name: 'fire',
      label: FIRE,
    });
    expect(refs.entry(stay)).toMatchObject({ kind: 'action', revision: 4 });
  });
});

/** Пульт: «Пуск» отключён, пока нет трёх отметок; «Остаться» доступно. */
const PultScreenDef = ScreenDef.define({
  name: 'pult',
  label: 'Пульт',
  description: 'Отключённое действие с причиной по состоянию.',
  reads: [],
  data: v.object({}),
  state: v.strictObject({
    ticks: v.pipe(v.number(), v.description('Число отметок')),
  }),
  actions: {
    stay: { label: 'Остаться', description: 'Остаётся на экране.' },
    fire: { label: 'Пуск', description: 'Доступно после трёх отметок.' },
  },
  locals: {
    tick: { label: 'Отметить', description: 'Прибавляет отметку.' },
  },
});

type Pult = typeof PultScreenDef;

class PultCode extends ScreenCode<Pult> {
  override readonly locals = {
    tick: (state: StateOf<Pult>): StateOf<Pult> => ({
      ticks: state.ticks + 1,
    }),
  };

  override readonly actions: Partial<ActionSteps<Pult>> = {
    stay: {
      done: () => {
        this.calls.push('stay');
        return PultScreenDef.at({});
      },
    },
    fire: {
      done: () => {
        this.calls.push('fire');
        return PultScreenDef.at({});
      },
    },
  };

  override readonly availability = {
    fire: ({ state }: { readonly state: StateOf<Pult> }) =>
      Availability.when(state.ticks >= 3, `${NEED}: ${3 - state.ticks}`),
  };

  constructor(private readonly calls: string[]) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override initialState(): StateOf<Pult> {
    return { ticks: 0 };
  }
}

const SnapshotSetDef = UiSetDef.define({
  name: 'snapshotUi',
  label: 'Набор снимков',
  description: 'Пульт с отключённым действием.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'snap',
      label: 'Снимки',
      description: 'Пульт.',
      screens: [PultScreenDef],
      stories: [],
    }),
  ],
});

const SnapshotAppDef = UiAppDef.define({
  name: 'snapshotDialog',
  label: 'Снимки',
  description: 'Приложение UI пульта.',
  set: SnapshotSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Пульт',
      description: 'Вход: пульт.',
      address: PultScreenDef.at({}),
    },
  },
});

const views = ChatViews.of(SnapshotSetDef, [
  ScreenPresenter.for(
    PultScreenDef,
    ({ state }) => `Пульт: ${state?.ticks ?? 0}`,
  ),
]);

let signals = 0;
let requests = 0;
let epochs = 0;

/** Беседа на исполнителе с заглушками; `snapshot` — беседа после перезапуска на том же мессенджере. */
const sceneOf = (
  messenger: MemoryMessenger,
  snapshot?: ConversationSnapshot,
) => {
  const calls: string[] = [];
  const codes = CodeLoaders.of(SnapshotSetDef, [
    CodeLoader.screen(PultScreenDef, async () => new PultCode(calls)),
  ]);
  const kit = new RuntimeKit(codes, SnapshotSetDef);
  const conversation = new Conversation(
    {
      app: SnapshotAppDef,
      runtime: kit.runtime,
      contexts: { context: async () => testRenderContext },
      traces: new DialogTraces(() => {
        requests += 1;
        return `r-${requests}`;
      }),
      views,
      messenger,
      logger: new MemoryLogger(),
      peer: PEER,
      person: A,
      home: 'start',
      epochs: () => {
        epochs += 1;
        return `ep${String(epochs).padStart(3, '0')}`;
      },
    },
    snapshot,
  );
  const head = () => {
    signals += 1;
    return { id: `s-${signals}`, peer: PEER, sender: 'sender-a' };
  };
  return {
    kit,
    calls,
    conversation,
    enter: async () => {
      await conversation.receive({ ...head(), kind: 'enter', entry: 'start' });
    },
    pressRef: async (ref: string): Promise<string> => {
      const at = head();
      const press = `p-${at.id}`;
      await conversation.receive({ ...at, kind: 'press', ref, press });
      return press;
    },
  };
};

/** Ссылка варианта `label` из самого свежего сообщения беседы, где он есть. */
const refOf = (messenger: MemoryMessenger, label: string): string => {
  for (const line of [...messenger.chat(PEER)].reverse()) {
    const option = line.message.options.find((o) => o.label === label);
    if (option !== undefined) return option.ref;
  }
  throw new Error(`нет варианта «${label}»`);
};

const lastText = (messenger: MemoryMessenger) => {
  const line = messenger.chat(PEER).at(-1);
  if (line === undefined) throw new Error('сообщений нет');
  return PlainText.of(line.message.text);
};

/** Снимок как из хранилища: через круг JSON и схему. */
const stored = (snapshot: ConversationSnapshot): ConversationSnapshot =>
  v.parse(ConversationSnapshotSchema, JSON.parse(JSON.stringify(snapshot)));

/**
 * Снимок, каким его писал пакет до записей `disabled`: ни записей, ни
 * отключённых вариантов в последнем сообщении, отпечаток — по доступным
 * вариантам показа.
 */
const withoutDisabled = async (
  snapshot: ConversationSnapshot,
): Promise<ConversationSnapshot> => {
  const { screen } = snapshot;
  if (screen === undefined) throw new Error('в снимке нет экрана');
  const dropped = new Set(
    snapshot.refs.filter((r) => r.kind === 'disabled').map((r) => r.ref),
  );
  const shown = await ScreenFingerprint.of([
    {
      kind: 'text',
      text: TextBuilder.of('Пульт: 0'),
      options: [
        { kind: 'action', name: 'stay', label: 'Остаться' },
        { kind: 'local', name: 'tick', label: 'Отметить' },
      ],
    },
  ]);
  const message = screen.message;
  return {
    ...snapshot,
    refs: snapshot.refs.filter((r) => r.kind !== 'disabled'),
    screen: {
      ...screen,
      shown,
      ...(message === undefined
        ? {}
        : {
            message: {
              ...message,
              options: message.options.filter((o) => !dropped.has(o.ref)),
            },
          }),
    },
  };
};

describe('Conversation — снимок и отключённые варианты', () => {
  test('снимок записан с записью disabled: имя действия и подпись, без причины', async () => {
    const messenger = MemoryMessenger.editing();
    const first = sceneOf(messenger);
    await first.enter();

    const saved = stored(first.conversation.snapshot());

    expect<unknown>(saved.refs.find((r) => r.kind === 'disabled')).toEqual({
      ref: refOf(messenger, FIRE),
      kind: 'disabled',
      screen: saved.screen?.serial,
      name: 'fire',
      label: FIRE,
    });
    expect(JSON.stringify(saved)).not.toContain(NEED);
  });

  test('прежний снимок (без записей disabled) читается: после восстановления ссылка действия на новой ревизии — нажатие исполняется, «Экран обновился» нет', async () => {
    const messenger = MemoryMessenger.editing();
    const first = sceneOf(messenger);
    await first.enter();
    const stay = refOf(messenger, 'Остаться');
    const old = stored(await withoutDisabled(first.conversation.snapshot()));
    first.conversation.close();
    const second = sceneOf(messenger, old);

    await second.pressRef(stay);

    expect(second.calls).toEqual(['stay']);
    expect(lastText(messenger)).toBe('Пульт: 0');
  });

  test('снимок с записью disabled — беседа оживает: нажатие по ней отвечает причиной по живому виду, ядро не вызвано', async () => {
    const messenger = MemoryMessenger.editing();
    const first = sceneOf(messenger);
    await first.enter();
    const fire = refOf(messenger, FIRE);
    const saved = stored(first.conversation.snapshot());
    first.conversation.close();
    const second = sceneOf(messenger, saved);
    const from = messenger.journal.length;

    const press = await second.pressRef(fire);

    expect(messenger.journal.slice(from)).toEqual([
      { op: 'answered', peer: PEER, press, text: `${NEED}: 3` },
    ]);
    expect(second.calls).toEqual([]);
    expect(second.kit.ucs.names()).toEqual([]);
  });
});
