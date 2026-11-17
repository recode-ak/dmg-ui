import { describe, expect, test } from 'bun:test';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type InstanceView,
  type Refusal,
  type RenderContext,
  ScreenDef,
  UiIds,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { TextTrimmer } from '../limit/text-trimmer';
import { PlainText } from '../message/plain-text';
import { TextBuilder } from '../message/text-builder';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import { ChatViews } from './chat-views';
import { ScreenComposer } from './screen-composer';
import { ScreenPresenter } from './screen-presenter';
import type { ScreenRender, ViewOption } from './view.types';

// Показ вида без беседы, ссылок и сервера: варианты по умолчанию, «Назад»
// при непустом пути, вывод представления (короткая и полная форма), вид в
// отказе, шапка заместителя, проверка вывода и ключ истории. Вид — литерал
// `InstanceView` локального экрана; возможности — у подставных мессенджеров.

/** Экран с тремя действиями и двумя локальными; по одному недоступно в виде. */
const PanelScreenDef = ScreenDef.define({
  name: 'panel',
  label: 'Панель',
  description: 'Действия и локальные действия без полей.',
  params: v.strictObject({
    panelId: v.pipe(v.string(), v.description('Панель')),
  }),
  reads: [],
  data: v.object({
    title: v.pipe(v.string(), v.description('Название')),
    step: v.pipe(v.string(), v.description('Шаг')),
  }),
  state: v.strictObject({
    ticks: v.pipe(v.number(), v.description('Число отметок')),
  }),
  actions: {
    save: { label: 'Сохранить', description: 'Остаётся на экране.' },
    leave: { label: 'Дальше', description: 'Уходит с экрана.' },
    archive: { label: 'В архив', description: 'Недоступно в виде.' },
  },
  locals: {
    tick: { label: 'Отметить', description: 'Прибавляет отметку.' },
    fold: { label: 'Свернуть', description: 'Недоступно в виде.' },
  },
});

type Panel = typeof PanelScreenDef;

const ComposerSetDef = UiSetDef.define({
  name: 'composerUi',
  label: 'Набор показа',
  description: 'Один экран для сборщика показа.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'desk',
      label: 'Стол',
      description: 'Экран панели.',
      screens: [PanelScreenDef],
      stories: [],
    }),
  ],
});

const PANEL = new UiIds(ComposerSetDef).screen(PanelScreenDef);

/** Данные собеседника в виде: в тексте броска их быть не должно. */
const TITLE = 'Тайный хлеб';
const PANEL_ID = 'panel-7f3a';
const STEP = 'step-2';

const ADDRESS = { screen: PANEL, params: { panelId: PANEL_ID } };

const EDITING = MemoryMessenger.editing().capabilities;
const WINDOWED = MemoryMessenger.windowed(() => 0).capabilities;

const SAVE: ViewOption = { kind: 'action', name: 'save', label: 'Сохранить' };
const LEAVE: ViewOption = { kind: 'action', name: 'leave', label: 'Дальше' };
const TICK: ViewOption = { kind: 'local', name: 'tick', label: 'Отметить' };
const BACK: ViewOption = { kind: 'back', label: 'Назад' };
const RETRY: ViewOption = { kind: 'retry', label: 'Повторить' };
const HOME: ViewOption = { kind: 'home', label: 'В начало' };

/** Доступные действия по порядку, затем доступные локальные; подписи из Def. */
const DEFAULTS: readonly ViewOption[] = [SAVE, LEAVE, TICK];

const LOCKED: Refusal = {
  code: 'panel.locked',
  text: 'Нет доступа к панели.',
  caught: true,
};

const ready = (context: RenderContext = testRenderContext): InstanceView => ({
  screen: PANEL,
  address: ADDRESS,
  revision: 1,
  status: 'ready',
  data: { title: TITLE, step: STEP },
  state: { ticks: 0 },
  context,
  actions: [
    { name: 'save', available: true, fields: [] },
    { name: 'leave', available: true, fields: [] },
    { name: 'archive', available: false, fields: [] },
  ],
  locals: [
    { name: 'tick', available: true, fields: [] },
    { name: 'fold', available: false, fields: [] },
  ],
});

const refused = (
  refusal: Refusal,
  context: RenderContext = testRenderContext,
): InstanceView => ({
  screen: PANEL,
  address: ADDRESS,
  revision: 1,
  status: 'refused',
  refusal,
  context,
  actions: [],
  locals: [],
});

/** Короткая форма: текст тела и свой текст отказа по коду. */
const shortForm = ScreenPresenter.for(
  PanelScreenDef,
  ({ data }) => `Панель: ${data?.title}`,
  { 'panel.locked': 'Панель заперта.' },
);

const composerOf = (
  presenter: ScreenPresenter<Panel>,
  capabilities: MessengerCapabilities = EDITING,
) =>
  new ScreenComposer(ChatViews.of(ComposerSetDef, [presenter]), capabilities);

const rendering = (render: ScreenRender<Panel>) =>
  composerOf(ScreenPresenter.of(PanelScreenDef, { render }));

/** Текст броска; не бросило — тест падает. */
const thrown = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('ожидался бросок');
};

describe('ScreenComposer', () => {
  test('варианты по умолчанию — доступные действия, затем локальные, подписи из Def', () => {
    const seen: (readonly ViewOption[])[] = [];
    const composer = rendering((_, kit) => {
      seen.push(kit.options);
      return kit.message('Панель');
    });

    const composed = composer.compose(ready(), false);

    expect(seen).toEqual([DEFAULTS]);
    expect(composed.messages.map((message) => message.options)).toEqual([
      DEFAULTS,
    ]);
  });

  test('путь не пуст — «Назад» последним; пуст — нет', () => {
    const seen: (readonly ViewOption[])[] = [];
    const composer = rendering((_, kit) => {
      seen.push(kit.options);
      return kit.message('Панель');
    });

    const withPath = composer.compose(ready(), true);
    const withoutPath = composer.compose(ready(), false);

    expect(seen).toEqual([[...DEFAULTS, BACK], DEFAULTS]);
    expect(withPath.messages[0]?.options).toEqual([...DEFAULTS, BACK]);
    expect(withoutPath.messages[0]?.options).toEqual(DEFAULTS);
  });

  test('ScreenPresenter.for — одно сообщение с вариантами по умолчанию: текст как прежде', () => {
    const composer = composerOf(shortForm);

    expect(composer.compose(ready(), false)).toEqual({
      messages: [
        {
          kind: 'text',
          text: TextBuilder.of(`Панель: ${TITLE}`),
          options: DEFAULTS,
        },
      ],
    });
    expect(composer.compose(ready(), true).messages).toEqual([
      {
        kind: 'text',
        text: TextBuilder.of(`Панель: ${TITLE}`),
        options: [...DEFAULTS, BACK],
      },
    ]);
  });

  test('представление скрывает и переставляет «Назад» и меняет подписи', () => {
    const reordered: readonly ViewOption[] = [
      { kind: 'back', label: 'Вернуться' },
      TICK,
      { kind: 'action', name: 'save', label: 'Записать' },
    ];
    const reordering = rendering((_, kit) => kit.message('Панель', reordered));
    const hiding = rendering((_, kit) =>
      kit.message(
        'Панель',
        kit.options.filter((option) => option.kind !== 'back'),
      ),
    );

    expect(reordering.compose(ready(), true).messages[0]?.options).toEqual(
      reordered,
    );
    expect(hiding.compose(ready(), true).messages[0]?.options).toEqual(
      DEFAULTS,
    );
  });

  test('несколько сообщений — варианты у последнего; варианты не у последнего — бросок', () => {
    const second = new TextBuilder().bold('Второе').build();
    const two = rendering((_, kit) => [
      kit.message('Первое', []),
      kit.message(second),
    ]);
    const most = rendering((_, kit) =>
      Array.from({ length: 32 }, (_, i) => kit.message(`Часть ${i + 1}`, [])),
    );
    const early = rendering((_, kit) => [
      kit.message('Первое'),
      kit.message('Второе', []),
    ]);

    expect(two.compose(ready(), false).messages).toEqual([
      { kind: 'text', text: TextBuilder.of('Первое'), options: [] },
      { kind: 'text', text: second, options: DEFAULTS },
    ]);
    expect(most.compose(ready(), false).messages).toHaveLength(32);
    expect(() => early.compose(ready(), false)).toThrow(PANEL);
  });

  test.each<[string, boolean, ScreenRender<Panel>]>([
    [
      'вариант недоступного действия',
      false,
      ({ data }, kit) =>
        kit.message(`Панель: ${data?.title}`, [
          { kind: 'action', name: 'archive', label: 'В архив' },
        ]),
    ],
    [
      'локальное действие под видом действия',
      false,
      ({ data }, kit) =>
        kit.message(`Панель: ${data?.title}`, [
          { kind: 'action', name: 'tick', label: 'Отметить' },
        ]),
    ],
    [
      '«Назад» при пустом пути',
      false,
      ({ data }, kit) =>
        kit.message(`Панель: ${data?.title}`, [...kit.options, BACK]),
    ],
    [
      'повтор варианта',
      false,
      ({ data }, kit) =>
        kit.message(`Панель: ${data?.title}`, [...kit.options, SAVE]),
    ],
    [
      'повтор варианта с другой подписью',
      false,
      ({ data }, kit) =>
        kit.message(`Панель: ${data?.title}`, [
          SAVE,
          { kind: 'action', name: 'save', label: 'Ещё раз' },
        ]),
    ],
    [
      'повтор «Назад»',
      true,
      ({ data }, kit) =>
        kit.message(`Панель: ${data?.title}`, [
          BACK,
          { kind: 'back', label: 'Вернуться' },
        ]),
    ],
    [
      'пустая подпись',
      false,
      ({ data }, kit) =>
        kit.message(`Панель: ${data?.title}`, [
          { kind: 'action', name: 'save', label: '' },
        ]),
    ],
    ['пустой список', false, () => []],
    [
      'больше 32 сообщений',
      false,
      ({ data }, kit) =>
        Array.from({ length: 33 }, () =>
          kit.message(`Панель: ${data?.title}`, []),
        ),
    ],
  ])(
    '%s — бросок с id экрана, данных вида в тексте броска нет',
    (_, back, render) => {
      const message = thrown(() => rendering(render).compose(ready(), back));

      expect(message).toContain(PANEL);
      expect(message).not.toContain(TITLE);
      expect(message).not.toContain(PANEL_ID);
      expect(message).not.toContain(STEP);
    },
  );

  test('вид в отказе — текст отказа (у caught — текст представления), «Повторить», «В начало»; при непустом пути — и «Назад»; представление не вызывается', () => {
    let calls = 0;
    const composer = composerOf(
      ScreenPresenter.of(PanelScreenDef, {
        render: (_, kit) => {
          calls += 1;
          return kit.message('Панель');
        },
        caught: { 'panel.locked': 'Панель заперта.' },
        history: 'address',
      }),
    );
    const textOf = (refusal: Refusal) =>
      composer.compose(refused(refusal), false).messages[0]?.text;

    expect(composer.compose(refused(LOCKED), false)).toEqual({
      messages: [
        {
          kind: 'text',
          text: TextBuilder.of('Панель заперта.'),
          options: [RETRY, HOME],
        },
      ],
    });
    expect(composer.compose(refused(LOCKED), true).messages).toEqual([
      {
        kind: 'text',
        text: TextBuilder.of('Панель заперта.'),
        options: [RETRY, BACK, HOME],
      },
    ]);
    expect(textOf({ ...LOCKED, caught: false })).toEqual(
      TextBuilder.of('Нет доступа к панели.'),
    );
    expect(textOf({ ...LOCKED, code: 'panel.gone' })).toEqual(
      TextBuilder.of('Нет доступа к панели.'),
    );
    expect(
      composerOf(shortForm).compose(refused(LOCKED), false).messages[0]?.text,
    ).toEqual(TextBuilder.of('Панель заперта.'));
    expect(calls).toBe(0);
  });

  test('шапка заместителя и «только чтение» — первым абзацем первого сообщения', () => {
    const delegate = { ...testRenderContext, delegate: true };
    const readOnly = { ...testRenderContext, readOnly: true };
    const both = { ...testRenderContext, delegate: true, readOnly: true };
    const two = rendering(({ data }, kit) => [
      kit.message(new TextBuilder().bold(data?.title ?? '').build(), []),
      kit.message('Второе'),
    ]);

    expect(
      two.compose(ready(delegate), false).messages.map((m) => m.text),
    ).toEqual([
      new TextBuilder()
        .text('(Вы работаете за другого человека)')
        .paragraph()
        .bold(TITLE)
        .build(),
      TextBuilder.of('Второе'),
    ]);
    expect(
      composerOf(shortForm).compose(ready(readOnly), false).messages[0]?.text,
    ).toEqual(TextBuilder.of(`(только чтение)\n\nПанель: ${TITLE}`));
    expect(
      composerOf(shortForm).compose(refused(LOCKED, both), false).messages[0]
        ?.text,
    ).toEqual(
      TextBuilder.of(
        '(Вы работаете за другого человека, только чтение)\n\nПанель заперта.',
      ),
    );
  });

  test("ключ истории: 'address' — от адреса, функция — от вида; без history — ключа нет", () => {
    const byAddress = composerOf(
      ScreenPresenter.of(PanelScreenDef, {
        render: (_, kit) => kit.message('Панель'),
        history: 'address',
      }),
    );
    const byStep = composerOf(
      ScreenPresenter.of(PanelScreenDef, {
        render: (_, kit) => kit.message('Панель'),
        history: ({ data }) => `шаг ${data?.step}`,
      }),
    );
    const without = rendering((_, kit) => kit.message('Панель'));

    expect(byAddress.compose(ready(), false).history).toBe(
      JSON.stringify(ADDRESS),
    );
    expect(byStep.compose(ready(), false).history).toBe(`шаг ${STEP}`);
    expect(without.compose(ready(), false).history).toBeUndefined();
    expect(
      composerOf(shortForm).compose(ready(), false).history,
    ).toBeUndefined();
    expect(byAddress.compose(refused(LOCKED), false).history).toBeUndefined();
  });

  test('возможности мессенджера доходят до представления: обрезка по capabilities.text даёт разный текст у editing и windowed', () => {
    // 3000 эмодзи: 6000 единиц utf16 сверх 4096, 3000 кодовых точек — в лимите.
    const long = TextBuilder.of('😀'.repeat(3000));
    const seen: MessengerCapabilities[] = [];
    const presenter = ScreenPresenter.of(PanelScreenDef, {
      render: (_, kit) => {
        seen.push(kit.capabilities);
        return kit.message(new TextTrimmer(kit.capabilities.text).trim(long));
      },
    });

    const editing = composerOf(presenter, EDITING).compose(ready(), false);
    const windowed = composerOf(presenter, WINDOWED).compose(ready(), false);

    expect(seen).toEqual([EDITING, WINDOWED]);
    expect(windowed.messages[0]?.text).toEqual(long);
    expect(editing.messages[0]?.text).toEqual(
      new TextTrimmer(EDITING.text).trim(long),
    );
    expect(PlainText.of(editing.messages[0]?.text ?? [])).toEndWith('…');
  });
});
