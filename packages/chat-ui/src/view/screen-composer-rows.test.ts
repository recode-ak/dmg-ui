import { describe, expect, test } from 'bun:test';
import { ExampleAppDef } from 'dmg-core/testing/example';
import {
  type ActionView,
  type InstanceView,
  ScreenDef,
  UiIds,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { testRenderContext } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { AppChatViews } from './app-chat-views';
import { ChatViews } from './chat-views';
import { ScreenComposer } from './screen-composer';
import { ScreenPresenter } from './screen-presenter';
import type { ScreenRender, ViewOption } from './view.types';

// Действие строки в показе (действие строки списка): строки вида разворачиваются
// в варианты `row` на месте действия в порядке `actions`; пустой список — без
// вариантов; отключённое действие — один вариант `disabled` с подписью
// действия. Сверка варианта представления — по `row:<имя>:<значение>`. Вид —
// литерал `InstanceView`.

const PanelScreenDef = ScreenDef.define({
  name: 'panel',
  label: 'Панель',
  description: 'Действие строки между обычными действиями.',
  reads: [],
  data: v.object({
    items: v.array(
      v.object({
        id: v.pipe(v.string(), v.description('Ключ')),
        title: v.pipe(v.string(), v.description('Подпись')),
      }),
    ),
  }),
  actions: {
    save: { label: 'Сохранить', description: 'Остаётся на экране.' },
    open: {
      label: 'Открыть',
      description: 'Действие строки.',
      input: v.object({ itemId: v.pipe(v.string(), v.description('Строка')) }),
      row: { list: 'items', key: 'id', label: 'title' },
    },
    leave: { label: 'Дальше', description: 'Остаётся на экране.' },
  },
  locals: {
    tick: { label: 'Отметить', description: 'Локальное действие.' },
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

const RowsSetDef = UiSetDef.define({
  name: 'rowsUi',
  label: 'Набор показа',
  description: 'Один экран для сборщика показа.',
  app: ExampleAppDef,
  modules: [DeskUiModuleDef],
});

const PANEL = new UiIds(RowsSetDef).screen(PanelScreenDef);
const EDITING = MemoryMessenger.editing().capabilities;
const AVAILABLE = { kind: 'available' } as const;
const DISABLED = { kind: 'disabled', text: 'Строк пока нет' } as const;

const BREAD = { value: 'b1', label: 'Хлеб' };
const MILK = { value: 'm2', label: 'Молоко' };

const row = (item: { value: string; label: string }): ViewOption => ({
  kind: 'row',
  name: 'open',
  value: item.value,
  label: item.label,
});
const SAVE: ViewOption = { kind: 'action', name: 'save', label: 'Сохранить' };
const LEAVE: ViewOption = { kind: 'action', name: 'leave', label: 'Дальше' };
const TICK: ViewOption = { kind: 'local', name: 'tick', label: 'Отметить' };
const BACK: ViewOption = { kind: 'back', label: 'Назад' };

/** Вид панели: действие `open` — с `rows` и доступностью `availability`. */
const viewOf = (
  rows: readonly { value: string; label: string }[],
  availability: ActionView['availability'] = AVAILABLE,
): InstanceView => ({
  screen: PANEL,
  address: { screen: PANEL, params: {} },
  revision: 1,
  status: 'ready',
  data: { items: [] },
  context: testRenderContext,
  actions: [
    { name: 'save', availability: AVAILABLE, fields: [] },
    {
      name: 'open',
      availability,
      fields: [
        {
          name: 'itemId',
          label: 'Строка',
          kind: 'choice',
          optional: false,
          choices: rows,
        },
      ],
      rows,
    },
    { name: 'leave', availability: AVAILABLE, fields: [] },
  ],
  locals: [{ name: 'tick', availability: AVAILABLE, fields: [] }],
});

const rendering = (render: ScreenRender<Panel>) =>
  new ScreenComposer(
    AppChatViews.ofSet(RowsSetDef, [
      ChatViews.of(DeskUiModuleDef, [
        ScreenPresenter.of(PanelScreenDef, { render }),
      ]),
    ]),
    EDITING,
  );

/** Варианты по умолчанию, как их видит представление. */
const optionsOf = (view: InstanceView, back = false) => {
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

describe('ScreenComposer — действие строки', () => {
  test('N строк — N вариантов row на месте действия: между «Сохранить» и «Дальше», в порядке строк', () => {
    expect(optionsOf(viewOf([BREAD, MILK]))).toEqual([
      SAVE,
      row(BREAD),
      row(MILK),
      LEAVE,
      TICK,
    ]);
  });

  test('варианты показа — те же, что у представления; «Назад» последним', () => {
    const composed = rendering((_, kit) => kit.message('Панель')).compose(
      viewOf([BREAD, MILK]),
      true,
    );

    expect(composed.messages[0]?.options).toEqual([
      SAVE,
      row(BREAD),
      row(MILK),
      LEAVE,
      TICK,
      BACK,
    ]);
  });

  test('список пуст — вариантов действия нет, остальные на месте', () => {
    expect(optionsOf(viewOf([]))).toEqual([SAVE, LEAVE, TICK]);
  });

  test('действие отключено — один вариант disabled с пометкой и подписью действия; вариантов строк нет', () => {
    expect(optionsOf(viewOf([BREAD, MILK], DISABLED))).toEqual([
      SAVE,
      LEAVE,
      TICK,
      { kind: 'disabled', name: 'open', label: '🚫 Открыть' },
    ]);
  });

  test('представление переподписывает строку: сверка по имени и значению, подпись не входит', () => {
    const relabeling = rendering((_, kit) =>
      kit.message(
        'Панель',
        kit.options.map((option) =>
          option.kind === 'row' && option.value === 'b1'
            ? { ...option, label: 'Свежий хлеб' }
            : option,
        ),
      ),
    );

    const options = relabeling.compose(viewOf([BREAD, MILK]), false).messages[0]
      ?.options;

    expect(options).toContainEqual({
      kind: 'row',
      name: 'open',
      value: 'b1',
      label: 'Свежий хлеб',
    });
  });

  test('вариант строки со значением не из вида — бросок: не из вариантов по умолчанию', () => {
    const foreign = rendering((_, kit) =>
      kit.message('Панель', [
        { kind: 'row', name: 'open', value: 'чужая', label: 'Чужая' },
      ]),
    );

    const message = thrown(() => foreign.compose(viewOf([BREAD, MILK]), false));

    expect(message).toContain(PANEL);
  });

  test('повтор варианта строки — бросок', () => {
    const doubled = rendering((_, kit) =>
      kit.message('Панель', [...kit.options, row(BREAD)]),
    );

    expect(() => doubled.compose(viewOf([BREAD, MILK]), false)).toThrow(PANEL);
  });
});
