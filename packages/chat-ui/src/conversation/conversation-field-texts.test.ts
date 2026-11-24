import { describe, expect, test } from 'bun:test';
import { type DomainError, ok, type Result } from 'dmg-core';
import { MemoryLogger, testUuid } from 'dmg-core/testing';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionSteps,
  AppCodeLoaders,
  CodeLoader,
  CodeLoaders,
  fieldHint,
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
import { DialogTraces } from '../dialog/dialog-traces';
import { PlainText } from '../message/plain-text';
import { AppChatViews } from '../view/app-chat-views';
import { ChatViews } from '../view/chat-views';
import { ScreenPresenter } from '../view/screen-presenter';
import { Conversation } from './conversation';
import type { ConversationSignal } from './conversation.types';

// Вопрос поля входа в беседе показывает не только подпись: после строки
// «Введите: <подпись>» («Выберите: …» у выбора) идут строки подсказки,
// «Пример: …» и «Пределы: …» (`FieldInput.limitsText`) — по строке на часть,
// пустые части опускаются. Замечание отвергнутого входа стоит перед вопросом
// через пустую строку. Приведение числа — «3» уходит в вход числом.

const HintedScreenDef = ScreenDef.define({
  name: 'hinted',
  label: 'Подсказки',
  description: 'Действия с полями разного вида.',
  reads: [],
  data: v.object({}),
  actions: {
    jump: {
      label: 'К части',
      description: 'Поле со всеми частями описания.',
      input: v.object({
        part: v.pipe(
          v.number('Введите номер части'),
          v.integer(),
          v.minValue(1, 'Части начинаются с первой'),
          v.maxValue(99, 'Не больше 99'),
          v.title('Часть'),
          v.examples([2]),
          fieldHint('Номер части списка, с первой'),
          v.description('Номер части'),
        ),
      }),
    },
    name: {
      label: 'Название',
      description: 'Поле с одной подсказкой.',
      input: v.object({
        title: v.pipe(
          v.string(),
          v.title('Название задачи'),
          fieldHint('Коротко: что нужно сделать'),
          v.description('Название'),
        ),
      }),
    },
    tag: {
      label: 'Метка',
      description: 'Поле только с пределами длины.',
      input: v.object({
        tag: v.pipe(
          v.string(),
          v.minLength(2),
          v.maxLength(8),
          v.title('Метка'),
          v.description('Метка'),
        ),
      }),
    },
    code: {
      label: 'Код',
      description: 'Поле только с примером.',
      input: v.object({
        code: v.pipe(
          v.string(),
          v.title('Код'),
          v.examples(['AB-1']),
          v.description('Код'),
        ),
      }),
    },
    level: {
      label: 'Уровень',
      description: 'Выбор с подсказкой.',
      input: v.object({
        level: v.pipe(
          v.picklist(['low', 'high']),
          v.title('Уровень'),
          fieldHint('Насколько важно'),
          v.description('Уровень'),
        ),
      }),
    },
    flag: {
      label: 'Срочность',
      description: 'Булево с подсказкой.',
      input: v.object({
        urgent: v.pipe(
          v.boolean(),
          v.title('Срочно'),
          fieldHint('Срочно ли это'),
          v.description('Срочность'),
        ),
      }),
    },
    plain: {
      label: 'Заметка',
      description: 'Поле без подсказки.',
      input: v.object({
        note: v.pipe(v.string(), v.title('Заметка'), v.description('Заметка')),
      }),
    },
  },
});

const HintUiModuleDef = UiModuleDef.define({
  name: 'hint',
  label: 'Подсказки',
  description: 'Один экран.',
  screens: [HintedScreenDef],
  stories: [],
});

const HintSetDef = UiSetDef.define({
  name: 'hintUi',
  label: 'Набор подсказок',
  description: 'Локальный экран подсказок полей.',
  app: ExampleAppDef,
  modules: [HintUiModuleDef],
});

const HintAppDef = UiAppDef.define({
  name: 'hintDialog',
  label: 'Подсказки',
  description: 'Приложение UI экрана подсказок.',
  set: HintSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  entries: {
    start: {
      label: 'Подсказки',
      description: 'Экран с полями.',
      address: HintedScreenDef.at({}),
    },
  },
});

const views = AppChatViews.ofSet(HintSetDef, [
  ChatViews.of(HintUiModuleDef, [
    ScreenPresenter.for(HintedScreenDef, () => 'Подсказки'),
  ]),
]);

class HintedCode extends ScreenCode<typeof HintedScreenDef> {
  override readonly actions: Partial<ActionSteps<typeof HintedScreenDef>> = {
    jump: { done: ({ input }) => this.take(input) },
    name: { done: ({ input }) => this.take(input) },
    tag: { done: ({ input }) => this.take(input) },
    code: { done: ({ input }) => this.take(input) },
    level: { done: ({ input }) => this.take(input) },
    flag: { done: ({ input }) => this.take(input) },
    plain: { done: ({ input }) => this.take(input) },
  };

  constructor(private readonly inputs: unknown[]) {
    super();
  }

  override async load(): Promise<Result<Record<string, never>, DomainError>> {
    return ok({});
  }

  private take(input: unknown) {
    this.inputs.push(input);
    return HintedScreenDef.at({});
  }
}

type Shown = Extract<MessengerEntry, { op: 'sent' | 'edited' }>;

/** Беседа на локальном экране: сигналы, мессенджер и собранные входы. */
const scene = () => {
  const inputs: unknown[] = [];
  const messenger = MemoryMessenger.editing();
  const logger = new MemoryLogger();
  const kit = new RuntimeKit(
    AppCodeLoaders.ofSet(HintSetDef, [
      CodeLoaders.of(HintUiModuleDef, [
        CodeLoader.screen(HintedScreenDef, async () => new HintedCode(inputs)),
      ]),
    ]),
  );
  let requests = 0;
  let epochs = 0;
  let ids = 0;
  const conversation = new Conversation({
    app: HintAppDef,
    runtime: kit.runtime,
    contexts: { context: async () => testRenderContext },
    traces: new DialogTraces(() => {
      requests += 1;
      return `r-${requests}`;
    }),
    views,
    messenger,
    logger,
    peer: 'peer-a',
    person: testUuid(1),
    home: 'start',
    epochs: () => {
      epochs += 1;
      return `ep${String(epochs).padStart(3, '0')}`;
    },
  });
  const head = () => {
    ids += 1;
    return { id: `s-${ids}`, peer: 'peer-a', sender: 'sender-a' };
  };
  const shown = (): Shown[] =>
    messenger.journal.filter(
      (entry): entry is Shown => entry.op === 'sent' || entry.op === 'edited',
    );
  const refOf = (label: string): string => {
    for (const entry of [...shown()].reverse()) {
      const option = entry.message.options.find((o) => o.label === label);
      if (option !== undefined) return option.ref;
    }
    throw new Error(`нет варианта «${label}»`);
  };
  const send = (signal: ConversationSignal) => conversation.receive(signal);
  return {
    inputs,
    start: () => send({ ...head(), kind: 'enter', entry: 'start' }),
    press: (label: string) =>
      send({ ...head(), kind: 'press', ref: refOf(label), press: `p-${ids}` }),
    text: (text: string) => send({ ...head(), kind: 'text', text }),
    last: () => {
      const entry = shown().at(-1);
      if (entry === undefined) throw new Error('сообщений нет');
      return entry;
    },
  };
};

/** Текст вопроса, который беседа задала после нажатия действия `label`. */
const asked = async (label: string): Promise<string> => {
  const s = scene();
  await s.start();
  await s.press(label);
  return PlainText.of(s.last().message.text);
};

describe('Беседа — вопрос поля с подсказкой', () => {
  test('все части: подпись, подсказка, пример и пределы — по строке', async () => {
    expect(await asked('К части')).toBe(
      [
        'Введите: Часть',
        'Номер части списка, с первой',
        'Пример: 2',
        'Пределы: от 1 до 99, целое',
      ].join('\n'),
    );
  });

  test('только подсказка: две строки, примера и пределов нет', async () => {
    expect(await asked('Название')).toBe(
      'Введите: Название задачи\nКоротко: что нужно сделать',
    );
  });

  test('только пределы длины: «Пределы: …» без подсказки и примера', async () => {
    expect(await asked('Метка')).toBe(
      'Введите: Метка\nПределы: от 2 до 8 символов',
    );
  });

  test('только пример: «Пример: …» без подсказки и пределов', async () => {
    expect(await asked('Код')).toBe('Введите: Код\nПример: AB-1');
  });

  test('без подсказки, примера и пределов — как прежде: одна строка', async () => {
    expect(await asked('Заметка')).toBe('Введите: Заметка');
  });

  test('выбор: «Выберите: …» и подсказка; варианты — кнопками', async () => {
    const s = scene();
    await s.start();
    await s.press('Уровень');

    const entry = s.last();

    expect(PlainText.of(entry.message.text)).toBe(
      'Выберите: Уровень\nНасколько важно',
    );
    expect(entry.message.options.map((o) => o.label)).toContain('low');
  });

  test('булево: «Выберите: …» с подсказкой, кнопки «Да» и «Нет»', async () => {
    const s = scene();
    await s.start();
    await s.press('Срочность');

    const entry = s.last();

    expect(PlainText.of(entry.message.text)).toBe(
      'Выберите: Срочно\nСрочно ли это',
    );
    expect(entry.message.options.map((o) => o.label)).toEqual(
      expect.arrayContaining(['Да', 'Нет']),
    );
  });

  test('отвергнутый ввод: замечание схемы, пустая строка, затем вопрос с подсказкой', async () => {
    const s = scene();
    await s.start();
    await s.press('К части');

    await s.text('abc');

    expect(PlainText.of(s.last().message.text)).toBe(
      [
        'Введите номер части',
        '',
        'Введите: Часть',
        'Номер части списка, с первой',
        'Пример: 2',
        'Пределы: от 1 до 99, целое',
      ].join('\n'),
    );
    expect(s.inputs).toEqual([]);
  });

  test('число из текста: «2» уходит в вход числом, не строкой', async () => {
    const s = scene();
    await s.start();
    await s.press('К части');

    await s.text('2');

    expect(s.inputs).toEqual([{ part: 2 }]);
  });

  test('число вне предела: «0» — замечание схемы её текстом, вход не ушёл', async () => {
    const s = scene();
    await s.start();
    await s.press('К части');

    await s.text('0');

    expect(PlainText.of(s.last().message.text)).toStartWith(
      'Части начинаются с первой\n\nВведите: Часть',
    );
    expect(s.inputs).toEqual([]);
  });
});
