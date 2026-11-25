import { describe, expect, test } from 'bun:test';
import type { InstanceView } from 'dmg-ui';
import { LIST_ID, TASK_A } from 'dmg-ui/example';
import { examplePagesViews } from '../../testing/text-views/example-pages.views';
import { ViewCell } from '../client/view-cell';
import type { PageTextTarget } from './page-region-presenter.types';
import { PageRenderer } from './page-renderer';
import { PageTextPresenter } from './page-text-presenter';
import type { PageViewState } from './page-view-state.types';

// Текстовое представление области поверх источника состояния: заметка, вид
// через `PageRenderer.screen`, замечания формы, подтверждение — через пустую
// строку. «Загрузка…» — вместо вида, «Обновляется…» — перед видом, пометка
// «нет связи» — первой строкой. Цель показа — запись строк; клиент, провод и
// сервер не нужны.

const LIST = { screen: LIST_ID, params: { page: 0 } };
const CONTEXT = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};
const VIEW: InstanceView = {
  screen: LIST_ID,
  address: LIST,
  revision: 1,
  status: 'ready',
  data: { tasks: [{ uuid: TASK_A, title: 'Хлеб', status: 'open' }] },
  state: { selected: [] },
  context: CONTEXT,
  actions: [],
  locals: [],
};
const REFUSED: InstanceView = {
  screen: LIST_ID,
  address: LIST,
  revision: 1,
  status: 'refused',
  refusal: {
    code: 'ACCESS_DENIED',
    text: 'Нет доступа к задачам',
    caught: true,
  },
  context: CONTEXT,
  actions: [],
  locals: [],
};
const EMPTY: PageViewState = { status: 'empty', refreshing: false, issues: [] };
const READY: PageViewState = {
  status: 'ready',
  address: LIST,
  view: VIEW,
  refreshing: false,
  issues: [],
};

const OFFLINE = 'Нет связи — переподключаемся';

const renderer = new PageRenderer(examplePagesViews());

/** Представление на ячейке: записи цели и отписка. */
const shown = (initial: PageViewState) => {
  const cell = new ViewCell(initial);
  const writes: string[] = [];
  const target: PageTextTarget = {
    write: (text) => {
      writes.push(text);
    },
  };
  const off = new PageTextPresenter(examplePagesViews()).show(cell, target);
  return { cell, writes, off };
};

describe('PageTextPresenter.show', () => {
  test('пишет сразу при показе: текст готового вида', () => {
    const { writes } = shown(READY);

    expect(writes).toEqual([renderer.screen(VIEW)]);
  });

  test('каждое новое значение источника — новая запись', () => {
    const { cell, writes } = shown(EMPTY);

    cell.set(READY);

    expect(writes).toEqual(['', renderer.screen(VIEW)]);
  });

  test('после отписки записей нет', () => {
    const { cell, writes, off } = shown(EMPTY);

    off();
    cell.set(READY);

    expect(writes).toEqual(['']);
  });
});

describe('PageTextPresenter — состояния области', () => {
  test('loading — заметка и «Загрузка…» вместо вида', () => {
    const { writes } = shown({
      status: 'loading',
      address: LIST,
      refreshing: false,
      note: 'Задача создана',
      issues: [],
    });

    expect(writes).toEqual(['Задача создана\n\nЗагрузка…']);
  });

  test('refreshing — «Обновляется…» перед прежним видом', () => {
    const { writes } = shown({ ...READY, refreshing: true });

    expect(writes).toEqual([`Обновляется…\n\n${renderer.screen(VIEW)}`]);
  });

  test('refused — текст отказа и «[Повторить]»', () => {
    const { writes } = shown({
      status: 'refused',
      address: LIST,
      view: REFUSED,
      refreshing: false,
      issues: [],
    });

    expect(writes[0]).toContain('Нет доступа к задачам');
    expect(writes[0]).toContain('[Повторить]');
  });

  test('empty с заметкой — только заметка', () => {
    const { writes } = shown({ ...EMPTY, note: 'Страница не найдена' });

    expect(writes).toEqual(['Страница не найдена']);
  });

  test('ready — склейка «заметка, вид, замечания, подтверждение» через пустую строку', () => {
    const { writes } = shown({
      ...READY,
      note: 'Данные обновились',
      issues: [
        { field: 'title', text: 'Пусто' },
        { text: 'Форма не прошла проверку' },
      ],
      confirm: { action: 'a', label: 'Точно?', description: 'Насовсем.' },
    });

    expect(writes).toEqual([
      [
        'Данные обновились',
        renderer.screen(VIEW),
        '! title: Пусто',
        '! Форма не прошла проверку',
        'Точно?\nНасовсем.\n  [Подтвердить]',
      ].join('\n\n'),
    ]);
  });
});

describe('PageTextPresenter — нет связи', () => {
  test('stale: offline — пометка первой строкой, перед заметкой и видом', () => {
    const { writes } = shown({
      ...READY,
      stale: 'offline',
      note: 'Задача создана',
    });

    expect(writes).toEqual([
      [OFFLINE, 'Задача создана', renderer.screen(VIEW)].join('\n\n'),
    ]);
  });

  test('offline при перечитывании — обе строки: пометка, затем «Обновляется…» и вид', () => {
    const { writes } = shown({ ...READY, stale: 'offline', refreshing: true });

    expect(writes).toEqual([
      [OFFLINE, 'Обновляется…', renderer.screen(VIEW)].join('\n\n'),
    ]);
  });

  test('loading без связи — пометка перед «Загрузка…»', () => {
    const { writes } = shown({
      status: 'loading',
      address: LIST,
      refreshing: false,
      stale: 'offline',
      issues: [],
    });

    expect(writes).toEqual([`${OFFLINE}\n\nЗагрузка…`]);
  });

  test('stale: revision пометки «нет связи» не даёт', () => {
    const { writes } = shown({
      ...READY,
      stale: 'revision',
      note: 'Данные обновились',
    });

    expect(writes).toEqual([
      ['Данные обновились', renderer.screen(VIEW)].join('\n\n'),
    ]);
  });
});

describe('PageTextPresenter — ожидаемый итог', () => {
  const EXPECTING = 'Ждём ответа…';

  test('expected — «Ждём ответа…» перед видом', () => {
    const { writes } = shown({ ...READY, expected: true });

    expect(writes).toEqual([`${EXPECTING}\n\n${renderer.screen(VIEW)}`]);
  });

  test('expected при перечитывании — «Ждём ответа…», затем «Обновляется…», затем вид', () => {
    const { writes } = shown({ ...READY, expected: true, refreshing: true });

    const text = writes[0] ?? '';
    const view = text.indexOf(renderer.screen(VIEW));
    expect(text.indexOf(EXPECTING)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(EXPECTING)).toBeLessThan(view);
    expect(text.indexOf('Обновляется…')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Обновляется…')).toBeLessThan(view);
    expect(text.indexOf(EXPECTING)).toBeLessThan(text.indexOf('Обновляется…'));
  });
});
