import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
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
import { Dialog } from './dialog';
import type { DialogReply } from './dialog.types';
import { DIALOG_CHANNEL } from './dialog-channel.const';
import { DialogReplies } from './dialog-replies';
import { DialogTraces } from './dialog-traces';
import { DialogViews, ScreenPresenter } from './dialog-views';

// Вход по шагам на локальных Def (случаи, которых нет в примере): в учебном примере нет
// действия с несколькими полями и основного действия без полей. Ссылки
// варианта и «Пропустить» привязаны к полю своего шага; основное действие
// без полей свободным текстом не запускается.

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

const StepsSetDef = UiSetDef.define({
  name: 'stepsUi',
  label: 'Набор шагов',
  description: 'Локальные экраны входа по шагам.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'steps',
      label: 'Шаги',
      description: 'Форма и пинг.',
      screens: [FormScreenDef, PingScreenDef],
      stories: [],
    }),
  ],
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

/** Диалог на исполнителе с заглушками портов: канал и сервер не нужны. */
const dialogOf = () => {
  const kit = new RuntimeKit(
    CodeLoaders.of(StepsSetDef, [
      CodeLoader.screen(FormScreenDef, async () => new FormCode()),
      CodeLoader.screen(PingScreenDef, async () => new PingCode()),
    ]),
    StepsSetDef,
  );
  let requests = 0;
  const dialog = new Dialog({
    app: StepsAppDef,
    runtime: kit.runtime,
    identity: { context: async () => testRenderContext },
    traces: new DialogTraces(() => {
      requests += 1;
      return `r-${requests}`;
    }),
    replies: new DialogReplies(
      DialogViews.of(StepsSetDef, [
        ScreenPresenter.for(FormScreenDef, () => 'Форма'),
        ScreenPresenter.for(PingScreenDef, () => 'Пинг'),
      ]),
    ),
  });
  return { kit, dialog };
};

const last = (replies: readonly DialogReply[]): DialogReply => {
  const reply = replies.at(-1);
  if (reply === undefined) throw new Error('реплик нет');
  return reply;
};

const ref = (dialog: Dialog, label: string): string => {
  const option = last(dialog.replies).options.find((o) => o.label === label);
  if (option === undefined) throw new Error(`нет варианта «${label}»`);
  return option.ref;
};

const press = (dialog: Dialog, label: string) =>
  dialog.press(ref(dialog, label));

const acted = (kit: RuntimeKit) =>
  kit.observer.records.filter((r) => r.kind === 'acted').length;

describe('Dialog — ссылки варианта и «Пропустить» привязаны к полю', () => {
  test('вариант прошлого шага того же черновика текущее поле не заполняет', async () => {
    const { kit, dialog } = dialogOf();
    await dialog.start('start');
    await press(dialog, 'Отправить');
    const first = ref(dialog, 'Первый');
    await dialog.press(first);
    const asked = last(dialog.replies).text;

    await dialog.press(first);
    const stale = last(dialog.replies).text;
    await press(dialog, 'Малый');
    await press(dialog, 'Пропустить');

    expect(asked).toContain('Размер');
    expect(stale).toContain('Действие сейчас недоступно');
    expect(acted(kit)).toBe(1);
    expect(
      kit.observer.records.filter((r) => r.kind === 'outcome'),
    ).toMatchObject([{ outcome: 'stayed' }]);
  });

  test('«Пропустить» прошлого шага на обязательном поле — реплика, не бросок', async () => {
    const { kit, dialog } = dialogOf();
    await dialog.start('start');
    await press(dialog, 'Отправить');
    await press(dialog, 'Первый');
    await press(dialog, 'Огромный');
    const skip = ref(dialog, 'Пропустить');
    await dialog.press(skip);
    const repeated = last(dialog.replies).text;

    await dialog.press(skip);
    const stale = last(dialog.replies).text;
    await press(dialog, 'Малый');

    expect(repeated).toContain('Размер');
    expect(stale).toContain('Действие сейчас недоступно');
    expect(acted(kit)).toBe(2);
    expect(
      kit.observer.records.filter((r) => r.kind === 'outcome').at(-1),
    ).toMatchObject({ outcome: 'stayed' });
  });
});

describe('Dialog — свободный текст и основное действие', () => {
  test('основное действие без полей свободным текстом не запускается — «Выберите вариант»', async () => {
    const { kit, dialog } = dialogOf();
    await dialog.start('ping');

    await dialog.say('пинг');

    expect(last(dialog.replies).text).toContain('Выберите вариант');
    expect(acted(kit)).toBe(0);
  });

  test('основное действие с полем — текст заполняет первое поле, дальше по шагам', async () => {
    const { kit, dialog } = dialogOf();
    await dialog.start('start');

    await dialog.say('Второй');

    expect(last(dialog.replies).text).toContain('Размер');
    expect(acted(kit)).toBe(0);
  });
});
