import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  AppCodeLoaders,
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
import { MemoryMessenger } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog/dialog-channel.const';
import { DialogTraces } from '../dialog/dialog-traces';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import { AppChatViews } from '../view/app-chat-views';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';

// Вход беседы по шагам на локальных Def (случаи, которых нет в примере): в
// учебном примере нет действия с несколькими полями и основного действия без
// полей. Ссылки варианта и «Пропустить» привязаны к полю своего шага;
// основное действие без полей свободным текстом не запускается. На обоих
// подставных мессенджерах: проверяется видимое собеседнику, а не способ показа.

/** Форма: два поля с вариантами и необязательная заметка; «Огромный» схема отвергает. */
const FormScreenDef = ScreenDef.define({
  name: 'form',
  label: 'Форма',
  description: 'Действие с тремя полями входа.',
  reads: [],
  data: v.object({}),
  actions: {
    send: {
      label: 'Отправить',
      description: 'Собирает три поля.',
      input: v.object({
        kind: v.pipe(v.picklist(['a', 'b']), v.description('Вид')),
        size: v.pipe(v.picklist(['s', 'm']), v.description('Размер')),
        note: v.optional(v.pipe(v.string(), v.description('Заметка'))),
      }),
    },
  },
  primary: 'send',
});

/** Экран с основным действием без полей входа. */
const PingScreenDef = ScreenDef.define({
  name: 'ping',
  label: 'Пинг',
  description: 'Основное действие без полей.',
  reads: [],
  data: v.object({}),
  actions: {
    ping: { label: 'Пинг', description: 'Действие без входа.' },
  },
  primary: 'ping',
});

class FormCode extends ScreenCode<typeof FormScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof FormScreenDef>> = {
    send: { done: () => FormScreenDef.at({}) },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  override choices(name: string): FieldChoices {
    if (name !== 'send') return {};
    return {
      kind: [
        { value: 'a', label: 'Первый' },
        { value: 'b', label: 'Второй' },
      ],
      size: [
        { value: 's', label: 'Малый' },
        { value: 'huge', label: 'Огромный' },
      ],
    };
  }
}

class PingCode extends ScreenCode<typeof PingScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof PingScreenDef>> = {
    ping: { done: () => PingScreenDef.at({}) },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

const StepsUiModuleDef = UiModuleDef.define({
  name: 'steps',
  label: 'Шаги',
  description: 'Форма и пинг.',
  screens: [FormScreenDef, PingScreenDef],
  stories: [],
});

const StepsSetDef = UiSetDef.define({
  name: 'stepsUi',
  label: 'Набор шагов',
  description: 'Локальные экраны входа по шагам.',
  app: ExampleAppDef,
  modules: [StepsUiModuleDef],
});

const StepsAppDef = UiAppDef.define({
  name: 'stepsDialog',
  label: 'Шаги в диалоге',
  description: 'Приложение UI локальных экранов.',
  set: StepsSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Форма',
      description: 'Форма с тремя полями.',
      address: FormScreenDef.at({}),
    },
    ping: {
      label: 'Пинг',
      description: 'Основное без полей.',
      address: PingScreenDef.at({}),
    },
  },
});

const A = testUuid(1);
const PEER = 'peer-a';

const MESSENGERS = [
  ['editing', () => MemoryMessenger.editing()],
  ['windowed', () => MemoryMessenger.windowed(() => 0)],
] as const;

const views = AppChatViews.ofSet(StepsSetDef, [
  ChatViews.of(StepsUiModuleDef, [
    ScreenPresenter.for(FormScreenDef, () => 'Форма'),
    ScreenPresenter.for(PingScreenDef, () => 'Пинг'),
  ]),
]);

/** Беседа на исполнителе с заглушками портов: узел бесед и сервер не нужны. */
const sceneOf = (messenger: MemoryMessenger) => {
  const kit = new RuntimeKit(
    AppCodeLoaders.ofSet(StepsSetDef, [
      CodeLoaders.of(StepsUiModuleDef, [
        CodeLoader.screen(FormScreenDef, async () => new FormCode()),
        CodeLoader.screen(PingScreenDef, async () => new PingCode()),
      ]),
    ]),
  );
  let requests = 0;
  let epochs = 0;
  let ids = 0;
  const conversation = new Conversation({
    app: StepsAppDef,
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
  });
  const head = () => {
    ids += 1;
    return { id: `s-${ids}`, peer: PEER, sender: 'sender-a' };
  };
  const pressRef = async (ref: string) => {
    const at = head();
    await conversation.receive({
      ...at,
      kind: 'press',
      ref,
      press: `p-${at.id}`,
    });
  };
  return {
    kit,
    enter: async (entry: string) => {
      await conversation.receive({ ...head(), kind: 'enter', entry });
    },
    say: async (text: string) => {
      await conversation.receive({ ...head(), kind: 'text', text });
    },
    pressRef,
    /** Ссылка варианта `label` из последнего сообщения беседы. */
    ref: (label: string) => refOf(messenger, label),
    press: (label: string) => pressRef(refOf(messenger, label)),
    /** Текст последнего сообщения беседы глазами собеседника. */
    last: () => PlainText.of(lastMessage(messenger).text),
  };
};

const lastMessage = (messenger: MemoryMessenger): Message => {
  const line = messenger.chat(PEER).at(-1);
  if (line === undefined) throw new Error('сообщений нет');
  return line.message;
};

const refOf = (messenger: MemoryMessenger, label: string): string => {
  const option = lastMessage(messenger).options.find((o) => o.label === label);
  if (option === undefined) throw new Error(`нет варианта «${label}»`);
  return option.ref;
};

const acted = (kit: RuntimeKit) =>
  kit.observer.records.filter((r) => r.kind === 'acted').length;

describe.each(MESSENGERS)(
  'Conversation — ссылки варианта и «Пропустить» привязаны к полю (%s)',
  (_, make) => {
    test('вариант прошлого шага того же черновика текущее поле не заполняет', async () => {
      const s = sceneOf(make());
      await s.enter('start');
      await s.press('Отправить');
      const first = s.ref('Первый');
      await s.pressRef(first);
      const asked = s.last();

      await s.pressRef(first);
      const stale = s.last();
      await s.press('Малый');
      await s.press('Пропустить');

      expect(asked).toContain('Размер');
      expect(stale).toContain('Действие сейчас недоступно');
      expect(acted(s.kit)).toBe(1);
      expect(
        s.kit.observer.records.filter((r) => r.kind === 'outcome'),
      ).toMatchObject([{ outcome: 'stayed' }]);
    });

    test('«Пропустить» прошлого шага на обязательном поле — вопрос поля снова, не бросок', async () => {
      const s = sceneOf(make());
      await s.enter('start');
      await s.press('Отправить');
      await s.press('Первый');
      await s.press('Огромный');
      const skip = s.ref('Пропустить');
      await s.pressRef(skip);
      const repeated = s.last();

      await s.pressRef(skip);
      const stale = s.last();
      await s.press('Малый');

      expect(repeated).toContain('Размер');
      expect(stale).toContain('Действие сейчас недоступно');
      expect(acted(s.kit)).toBe(2);
      expect(
        s.kit.observer.records.filter((r) => r.kind === 'outcome').at(-1),
      ).toMatchObject({ outcome: 'stayed' });
    });
  },
);

describe.each(MESSENGERS)(
  'Conversation — свободный текст и основное действие (%s)',
  (_, make) => {
    test('основное действие без полей свободным текстом не запускается — «Выберите вариант»', async () => {
      const s = sceneOf(make());
      await s.enter('ping');

      await s.say('пинг');

      expect(s.last()).toContain('Выберите вариант');
      expect(acted(s.kit)).toBe(0);
    });

    test('основное действие с полем — текст заполняет первое поле, дальше по шагам', async () => {
      const s = sceneOf(make());
      await s.enter('start');

      await s.say('Второй');

      expect(s.last()).toContain('Размер');
      expect(acted(s.kit)).toBe(0);
    });
  },
);
