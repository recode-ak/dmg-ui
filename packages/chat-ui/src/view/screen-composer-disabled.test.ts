import { describe, expect, test } from 'bun:test';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type InstanceView,
  ScreenDef,
  UiIds,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { ScreenLimits } from '../../testing/limits/screen-limits';
import { DialogRenderer } from '../dialog/dialog-renderer';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import { AppChatViews } from './app-chat-views';
import { ChatViews } from './chat-views';
import { ScreenComposer } from './screen-composer';
import { ScreenPresenter } from './screen-presenter';
import type { ScreenRender, ViewOption } from './view.types';

// Отключённое действие и локальное действие в показе: вариант `disabled` с
// пометкой в подписи — после доступных (действия, затем локальные), до
// «Назад»; скрытого в вариантах нет; текста причины в варианте нет. Вид —
// литерал `InstanceView`; сверка вывода представления с вариантами по
// умолчанию — по ключу `disabled:<имя>`.

/** Экран: часть действий и локальных действий отключена или скрыта в виде. */
const PanelScreenDef = ScreenDef.define({
  name: 'panel',
  label: 'Панель',
  description: 'Доступные, отключённые и скрытые действия.',
  params: v.strictObject({
    panelId: v.pipe(v.string(), v.description('Панель')),
  }),
  reads: [],
  data: v.object({
    title: v.pipe(v.string(), v.description('Название')),
  }),
  state: v.strictObject({
    ticks: v.pipe(v.number(), v.description('Число отметок')),
  }),
  actions: {
    save: { label: 'Сохранить', description: 'Доступно.' },
    leave: { label: 'Дальше', description: 'Доступно.' },
    archive: { label: 'В архив', description: 'Отключено в виде.' },
    purge: { label: 'Выполнить выбранные', description: 'Отключено в виде.' },
    secret: { label: 'Секрет', description: 'Скрыто в виде.' },
  },
  locals: {
    tick: { label: 'Отметить', description: 'Доступно.' },
    fold: { label: 'Свернуть', description: 'Отключено в виде.' },
    peek: { label: 'Подсмотреть', description: 'Скрыто в виде.' },
  },
});

type Panel = typeof PanelScreenDef;

const DeskUiModuleDef = UiModuleDef.define({
  name: 'desk',
  label: 'Стол',
  description: 'Экран панели.',
  screens: [PanelScreenDef],
  stories: [],
});

const ComposerSetDef = UiSetDef.define({
  name: 'disabledUi',
  label: 'Набор показа',
  description: 'Один экран для сборщика показа.',
  app: ExampleAppDef,
  modules: [DeskUiModuleDef],
});

const PANEL = new UiIds(ComposerSetDef).screen(PanelScreenDef);
const TITLE = 'Тайный хлеб';
const PANEL_ID = 'panel-7f3a';
const MARK = '🚫';
const REASON = 'Пока нельзя: причина для человека';

const EDITING = MemoryMessenger.editing().capabilities;

const AVAILABLE = { kind: 'available' } as const;
const DISABLED = { kind: 'disabled', text: REASON } as const;

/** Подпись отключённого варианта: пометка, пробел, подпись из Def. */
const marked = (label: string) => `${MARK} ${label}`;

const SAVE: ViewOption = { kind: 'action', name: 'save', label: 'Сохранить' };
const LEAVE: ViewOption = { kind: 'action', name: 'leave', label: 'Дальше' };
const TICK: ViewOption = { kind: 'local', name: 'tick', label: 'Отметить' };
const BACK: ViewOption = { kind: 'back', label: 'Назад' };
const ARCHIVE: ViewOption = {
  kind: 'disabled',
  name: 'archive',
  label: marked('В архив'),
};
const PURGE: ViewOption = {
  kind: 'disabled',
  name: 'purge',
  label: marked('Выполнить выбранные'),
};
const FOLD: ViewOption = {
  kind: 'disabled',
  name: 'fold',
  label: marked('Свернуть'),
};

const viewOf = (
  actions: InstanceView['actions'],
  locals: InstanceView['locals'],
): InstanceView => ({
  screen: PANEL,
  address: { screen: PANEL, params: { panelId: PANEL_ID } },
  revision: 1,
  status: 'ready',
  data: { title: TITLE },
  state: { ticks: 0 },
  context: testRenderContext,
  actions,
  locals,
});

/** Порядок в виде перемешан: отключённые идут между доступными; скрытых (`secret`, `peek`) в виде нет. */
const mixed = (): InstanceView =>
  viewOf(
    [
      { name: 'save', availability: AVAILABLE, fields: [] },
      { name: 'archive', availability: DISABLED, fields: [] },
      { name: 'leave', availability: AVAILABLE, fields: [] },
      { name: 'purge', availability: DISABLED, fields: [] },
    ],
    [
      { name: 'fold', availability: DISABLED, fields: [] },
      { name: 'tick', availability: AVAILABLE, fields: [] },
    ],
  );

const shortForm = ScreenPresenter.for(
  PanelScreenDef,
  ({ data }) => `Панель: ${data?.title}`,
);

const rendering = (
  render: ScreenRender<Panel>,
  capabilities: MessengerCapabilities = EDITING,
) =>
  new ScreenComposer(
    AppChatViews.ofSet(ComposerSetDef, [
      ChatViews.of(DeskUiModuleDef, [
        ScreenPresenter.of(PanelScreenDef, { render }),
      ]),
    ]),
    capabilities,
  );

/** Варианты по умолчанию, как их видит представление. */
const optionsOf = (view: InstanceView, back: boolean) => {
  const seen: (readonly ViewOption[])[] = [];
  rendering((_, kit) => {
    seen.push(kit.options);
    return kit.message('Панель');
  }).compose(view, back);
  return seen[0];
};

/** Текст броска; не бросило — тест падает. */
const thrown = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('ожидался бросок');
};

describe('ScreenComposer — отключённое', () => {
  test('отключённые действия и локальное — варианты disabled с пометкой: после доступных (действия, затем локальные), до «Назад»', () => {
    const composer = rendering((_, kit) => kit.message('Панель'));

    const composed = composer.compose(mixed(), true);

    const expected = [SAVE, LEAVE, TICK, ARCHIVE, PURGE, FOLD, BACK];
    expect(optionsOf(mixed(), true)).toEqual(expected);
    expect(composed.messages[0]?.options).toEqual(expected);
  });

  test('без пути «Назад» нет: отключённые — последние', () => {
    expect(optionsOf(mixed(), false)).toEqual([
      SAVE,
      LEAVE,
      TICK,
      ARCHIVE,
      PURGE,
      FOLD,
    ]);
  });

  test('два отключённых действия и одно доступное — доступное первым, отключённые в порядке вида', () => {
    const view = viewOf(
      [
        { name: 'archive', availability: DISABLED, fields: [] },
        { name: 'purge', availability: DISABLED, fields: [] },
        { name: 'save', availability: AVAILABLE, fields: [] },
      ],
      [],
    );

    expect(optionsOf(view, false)).toEqual([SAVE, ARCHIVE, PURGE]);
  });

  test('в варианте только имя и подпись с пометкой: текста причины нет нигде в выводе', () => {
    const composed = rendering((_, kit) => kit.message('Панель')).compose(
      mixed(),
      true,
    );

    expect(JSON.stringify(composed)).not.toContain(REASON);
    expect(composed.messages[0]?.options).toContainEqual({
      kind: 'disabled',
      name: 'archive',
      label: marked('В архив'),
    });
  });

  test('скрытого нет в вариантах: ни обычного, ни помеченного', () => {
    const options = optionsOf(mixed(), true) ?? [];

    expect(options.flatMap((o) => ('name' in o ? [o.name] : []))).toEqual([
      'save',
      'leave',
      'tick',
      'archive',
      'purge',
      'fold',
    ]);
    const labels = options.map((o) => o.label);
    for (const hidden of ['Секрет', 'Подсмотреть']) {
      expect(labels).not.toContain(hidden);
      expect(labels).not.toContain(marked(hidden));
    }
  });

  test('представление скрывает отключённые', () => {
    let offered = 0;
    const hiding = rendering((_, kit) => {
      offered = kit.options.filter(
        (option) => option.kind === 'disabled',
      ).length;
      return kit.message(
        'Панель',
        kit.options.filter((option) => option.kind !== 'disabled'),
      );
    });

    expect(hiding.compose(mixed(), true).messages[0]?.options).toEqual([
      SAVE,
      LEAVE,
      TICK,
      BACK,
    ]);
    expect(offered).toBe(3);
  });

  test('представление переставляет отключённые вперёд доступных', () => {
    const reordering = rendering((_, kit) =>
      kit.message('Панель', [
        ...kit.options.filter((option) => option.kind === 'disabled'),
        ...kit.options.filter((option) => option.kind !== 'disabled'),
      ]),
    );

    expect(reordering.compose(mixed(), false).messages[0]?.options).toEqual([
      ARCHIVE,
      PURGE,
      FOLD,
      SAVE,
      LEAVE,
      TICK,
    ]);
  });

  test('представление переподписывает отключённое: сверка идёт по имени, подпись не входит', () => {
    const relabeled: ViewOption = {
      kind: 'disabled',
      name: 'archive',
      label: 'Архив закрыт',
    };
    const relabeling = rendering((_, kit) =>
      kit.message(
        'Панель',
        kit.options.map((option) =>
          option.kind === 'disabled' && option.name === 'archive'
            ? relabeled
            : option,
        ),
      ),
    );

    expect(relabeling.compose(mixed(), false).messages[0]?.options).toEqual([
      SAVE,
      LEAVE,
      TICK,
      relabeled,
      PURGE,
      FOLD,
    ]);
  });

  test.each<[string, ScreenRender<Panel>]>([
    [
      'доступное действие под видом отключённого',
      (_, kit) =>
        kit.message('Панель', [
          { kind: 'disabled', name: 'save', label: marked('Сохранить') },
        ]),
    ],
    [
      'повтор отключённого',
      (_, kit) => kit.message('Панель', [...kit.options, ARCHIVE]),
    ],
  ])(
    '%s — бросок с id экрана, данных вида в тексте броска нет',
    (_, render) => {
      const message = thrown(() => rendering(render).compose(mixed(), false));

      expect(message).toContain(PANEL);
      expect(message).not.toContain(TITLE);
      expect(message).not.toContain(PANEL_ID);
    },
  );

  test('target — имя отключённого; accent — нет', () => {
    expect(ScreenComposer.target(ARCHIVE)).toBe('archive');
    expect(ScreenComposer.accent(ARCHIVE)).toBeUndefined();
  });

  test('DialogRenderer: отключённые — в строке вариантов в скобках, с пометкой, после доступных', () => {
    const renderer = new DialogRenderer(
      AppChatViews.ofSet(ComposerSetDef, [
        ChatViews.of(DeskUiModuleDef, [shortForm]),
      ]),
    );

    expect(renderer.screen(mixed())).toBe(
      `Панель: ${TITLE}\n\n[Сохранить] [Дальше] [Отметить] [${marked('В архив')}] [${marked('Выполнить выбранные')}] [${marked('Свернуть')}]`,
    );
  });
});

describe('ScreenComposer — пометка и лимит подписи', () => {
  /** Подписи и нарушения показа при пределе подписи `max` графем. */
  const shown = (max: number) => {
    const capabilities: MessengerCapabilities = {
      ...EDITING,
      options: { ...EDITING.options, label: { max, unit: 'grapheme' } },
    };
    const limits = new ScreenLimits(
      AppChatViews.ofSet(ComposerSetDef, [
        ChatViews.of(DeskUiModuleDef, [shortForm]),
      ]),
      capabilities,
    );
    const messages = limits.compose(mixed());
    return {
      labels: messages.flatMap((m) => m.options.map((o) => o.label)),
      lines: limits.check(messages),
    };
  };

  test('«Выполнить выбранные» (19 знаков) с пометкой не умещается в 20 — нарушение', () => {
    const { labels, lines } = shown(20);

    expect(labels).toContain(marked('Выполнить выбранные'));
    expect(lines).toEqual([expect.stringContaining('подпись длиннее лимита')]);
  });

  test('с пометкой в 24 знака подпись умещается — нарушений нет', () => {
    const { labels, lines } = shown(24);

    expect(labels).toContain(marked('Выполнить выбранные'));
    expect(lines).toEqual([]);
  });
});
