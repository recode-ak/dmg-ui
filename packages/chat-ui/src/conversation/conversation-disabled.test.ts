import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result, Rule } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { ExampleAppDef, type ExampleUser } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  Availability,
  CodeLoader,
  CodeLoaders,
  type RenderContext,
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
import { PlainText } from '../message/plain-text';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';

// Свободный текст при недоступном основном действии: отключённое — заметка с
// причиной, скрытое и отсутствующее — прежнее «Выберите вариант.»; отключённое
// и скрытое в вариантах не показываются; смена субъекта между показами —
// следующий показ с новым ответом.

const REASON = 'Приём закрыт до утра';

/** Экран: основное действие с полем и действие, видимое только администратору. */
const GateScreenDef = ScreenDef.define({
  name: 'gate',
  label: 'Ворота',
  description: 'Основное действие с полем и действие для администратора.',
  reads: [],
  data: v.object({}),
  actions: {
    fill: {
      label: 'Заполнить',
      description: 'Основное действие с одним полем.',
      input: v.object({
        title: v.pipe(v.string(), v.description('Название')),
      }),
    },
    manage: { label: 'Управлять', description: 'Только администратору.' },
  },
  primary: 'fill',
});

/** Экран без основного действия. */
const PlainScreenDef = ScreenDef.define({
  name: 'plain',
  label: 'Простой',
  description: 'Экран без основного действия.',
  reads: [],
  data: v.object({}),
  actions: {
    ping: { label: 'Пинг', description: 'Действие без входа.' },
  },
});

type Mode = 'open' | 'disabled' | 'hidden';

class GateCode extends ScreenCode<typeof GateScreenDef, ExampleUser> {
  override readonly actions: Partial<ActionSteps<typeof GateScreenDef>> = {
    fill: { done: () => GateScreenDef.at({}) },
    manage: { done: () => GateScreenDef.at({}) },
  };

  override readonly availability = {
    fill: () => this.fill(),
    manage: ({ subject }: { readonly subject?: ExampleUser }) =>
      Availability.policy(Rule.hasRole('admin'), subject, {}),
  };

  constructor(private readonly mode: Mode) {
    super();
  }

  private fill() {
    if (this.mode === 'hidden') return Availability.hidden();
    if (this.mode === 'disabled') return Availability.disabled(REASON);
    return Availability.yes();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

class PlainCode extends ScreenCode<typeof PlainScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof PlainScreenDef>> = {
    ping: { done: () => PlainScreenDef.at({}) },
  };

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }
}

const GateSetDef = UiSetDef.define({
  name: 'gateUi',
  label: 'Набор ворот',
  description: 'Экраны с недоступным основным действием.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'gates',
      label: 'Ворота',
      description: 'Ворота и простой экран.',
      screens: [GateScreenDef, PlainScreenDef],
      stories: [],
    }),
  ],
});

const GateAppDef = UiAppDef.define({
  name: 'gateDialog',
  label: 'Ворота в диалоге',
  description: 'Приложение UI экранов с недоступным основным действием.',
  set: GateSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Ворота',
      description: 'Ворота.',
      address: GateScreenDef.at({}),
    },
    plain: {
      label: 'Простой',
      description: 'Экран без основного действия.',
      address: PlainScreenDef.at({}),
    },
  },
});

const PEER = 'peer-a';
const user = (uuid: string, admin = false): ExampleUser => ({
  uuid,
  hasRole: () => admin,
});

const views = ChatViews.of(GateSetDef, [
  ScreenPresenter.for(GateScreenDef, () => 'Ворота'),
  ScreenPresenter.for(PlainScreenDef, () => 'Простой'),
]);

/** Беседа на заглушках портов; субъект показа задаёт `scene.subject`. */
const sceneOf = (mode: Mode) => {
  const messenger = MemoryMessenger.editing();
  const kit = new RuntimeKit(
    CodeLoaders.of(GateSetDef, [
      CodeLoader.screen(GateScreenDef, async () => new GateCode(mode)),
      CodeLoader.screen(PlainScreenDef, async () => new PlainCode()),
    ]),
    GateSetDef,
  );
  const holder: { subject: ExampleUser | undefined } = {
    subject: user(testUuid(1)),
  };
  let requests = 0;
  let epochs = 0;
  let ids = 0;
  const conversation = new Conversation({
    app: GateAppDef,
    runtime: kit.runtime,
    contexts: {
      context: async (): Promise<RenderContext> => ({
        ...testRenderContext,
        subject: holder.subject,
      }),
    },
    traces: new DialogTraces(() => {
      requests += 1;
      return `r-${requests}`;
    }),
    views,
    messenger,
    logger: new MemoryLogger(),
    peer: PEER,
    person: testUuid(1),
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
  const last = () => {
    const line = messenger.chat(PEER).at(-1);
    if (line === undefined) throw new Error('сообщений нет');
    return line.message;
  };
  return {
    kit,
    holder,
    enter: (entry: string) =>
      conversation.receive({ ...head(), kind: 'enter', entry }),
    say: (text: string) =>
      conversation.receive({ ...head(), kind: 'text', text }),
    text: () => PlainText.of(last().text),
    labels: () => last().options.map((option) => option.label),
    acted: () => kit.observer.records.filter((r) => r.kind === 'acted').length,
  };
};

describe('Conversation — свободный текст при недоступном основном действии', () => {
  test('основное отключено с причиной — ответ на текст называет причину, действие не запущено', async () => {
    const s = sceneOf('disabled');
    await s.enter('start');

    await s.say('Хлеб');

    expect(s.text()).toContain(REASON);
    expect(s.text()).not.toContain('Выберите вариант');
    expect(s.acted()).toBe(0);
  });

  test('основное скрыто — прежнее «Выберите вариант.»', async () => {
    const s = sceneOf('hidden');
    await s.enter('start');

    await s.say('Хлеб');

    expect(s.text()).toContain('Выберите вариант');
    expect(s.text()).not.toContain(REASON);
    expect(s.acted()).toBe(0);
  });

  test('основного действия у экрана нет — прежнее «Выберите вариант.»', async () => {
    const s = sceneOf('open');
    await s.enter('plain');

    await s.say('Хлеб');

    expect(s.text()).toContain('Выберите вариант');
  });

  test('основное доступно — текст заполняет поле: беседа идёт по шагам', async () => {
    const s = sceneOf('open');
    await s.enter('start');

    await s.say('Хлеб');

    expect(s.text()).not.toContain('Выберите вариант');
    expect(s.acted()).toBe(1);
  });
});

describe('Conversation — варианты по ответам доступности', () => {
  test('отключённое основное и скрытое — не варианты; причина в вариантах не показана', async () => {
    const disabled = sceneOf('disabled');
    const hidden = sceneOf('hidden');
    await disabled.enter('start');
    await hidden.enter('start');

    expect(disabled.labels()).not.toContain('Заполнить');
    expect(hidden.labels()).not.toContain('Заполнить');
    expect(disabled.labels().join()).not.toContain(REASON);
  });

  test('смена субъекта между показами — следующий показ с новым ответом', async () => {
    const s = sceneOf('open');
    await s.enter('start');
    const before = s.labels();
    s.holder.subject = user(testUuid(3), true);

    await s.enter('start');

    expect(before).not.toContain('Управлять');
    expect(s.labels()).toContain('Управлять');
  });

  test('субъекта нет — действие с Policy скрыто', async () => {
    const s = sceneOf('open');
    s.holder.subject = undefined;

    await s.enter('start');

    expect(s.labels()).toContain('Заполнить');
    expect(s.labels()).not.toContain('Управлять');
  });
});
