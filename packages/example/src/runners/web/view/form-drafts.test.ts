import { describe, expect, test } from 'bun:test';
import { CARD_ID, LIST_ID } from '../../../platform/ui';
import { FormDrafts } from './form-drafts';

// Набранное в полях живёт в памяти вкладки, а не в состоянии области: при
// пересоздании тела области (пришло перечитывание, заметка, пометка) ввод не
// теряется. Ключ черновика — область, экран, форма, поле. Значение модели
// (введённое в отвергнутую форму, начальное) применяется, пока поле не
// тронуто.

const TITLE = {
  region: 'main',
  screen: LIST_ID,
  form: 'create',
  field: 'title',
} as const;

describe('FormDrafts — запомнить и подставить', () => {
  test('поле не тронуто — значение модели', () => {
    const drafts = new FormDrafts();

    expect(drafts.value(TITLE, 'Новая задача')).toBe('Новая задача');
  });

  test('набранное запоминается и подставляется вместо значения модели', () => {
    const drafts = new FormDrafts();

    drafts.track(TITLE, 'Хлеб');

    expect(drafts.value(TITLE, 'Новая задача')).toBe('Хлеб');
  });

  test('значение модели сменилось — поле не тронуто, берётся новое', () => {
    const drafts = new FormDrafts();

    expect(drafts.value(TITLE, 'Новая задача')).toBe('Новая задача');
    expect(drafts.value(TITLE, 'Введённое в отвергнутую форму')).toBe(
      'Введённое в отвергнутую форму',
    );
  });

  test('тронутое поле не перетирается значением модели', () => {
    const drafts = new FormDrafts();
    drafts.track(TITLE, 'Сыр');

    expect(drafts.value(TITLE, 'Введённое в отвергнутую форму')).toBe('Сыр');
  });

  test('пустая строка — тоже набранное: стёртое поле не возвращает значение модели', () => {
    const drafts = new FormDrafts();
    drafts.track(TITLE, 'Сыр');
    drafts.track(TITLE, '');

    expect(drafts.value(TITLE, 'Новая задача')).toBe('');
  });
});

describe('FormDrafts — ключ: область, экран, форма, поле', () => {
  test('поля одной формы не смешиваются', () => {
    const drafts = new FormDrafts();
    drafts.track(TITLE, 'Хлеб');

    expect(drafts.value({ ...TITLE, field: 'other' }, 'x')).toBe('x');
  });

  test('формы одного экрана не смешиваются', () => {
    const drafts = new FormDrafts();
    drafts.track(TITLE, 'Хлеб');

    expect(drafts.value({ ...TITLE, form: 'search' }, 'x')).toBe('x');
  });

  test('области не смешиваются', () => {
    const drafts = new FormDrafts();
    drafts.track(TITLE, 'Хлеб');

    expect(drafts.value({ ...TITLE, region: 'side' }, 'x')).toBe('x');
  });
});

describe('FormDrafts — забыть', () => {
  test('forgetForm: черновики формы забыты, поле снова из модели', () => {
    const drafts = new FormDrafts();
    drafts.track(TITLE, 'Хлеб');
    drafts.track({ ...TITLE, field: 'note' }, 'заметка');

    drafts.forgetForm('main', LIST_ID, 'create');

    expect(drafts.value(TITLE, 'Новая задача')).toBe('Новая задача');
    expect(drafts.value({ ...TITLE, field: 'note' }, '')).toBe('');
  });

  test('forgetForm не трогает другие формы, экраны и области', () => {
    const drafts = new FormDrafts();
    const search = { ...TITLE, form: 'search' };
    const side = { ...TITLE, region: 'side' } as const;
    drafts.track(TITLE, 'Хлеб');
    drafts.track(search, 'Молоко');
    drafts.track(side, 'Сыр');

    drafts.forgetForm('main', LIST_ID, 'create');

    expect(drafts.value(search, 'x')).toBe('Молоко');
    expect(drafts.value(side, 'x')).toBe('Сыр');
  });

  test('forgetRegion: черновики области забыты, прочие области целы', () => {
    const drafts = new FormDrafts();
    const side = { ...TITLE, region: 'side' } as const;
    drafts.track(TITLE, 'Хлеб');
    drafts.track(side, 'Сыр');

    drafts.forgetRegion('main');

    expect(drafts.value(TITLE, 'Новая задача')).toBe('Новая задача');
    expect(drafts.value(side, 'x')).toBe('Сыр');
  });
});

describe('FormDrafts — смена экрана области', () => {
  test('ввод на другом экране той же области сбрасывает черновики прежнего экрана', () => {
    const drafts = new FormDrafts();
    const card = {
      region: 'main',
      screen: CARD_ID,
      form: 'assign',
      field: 'assigneeId',
    } as const;
    drafts.track(TITLE, 'Хлеб');

    drafts.track(card, 'кто-то');

    expect(drafts.value(card, 'x')).toBe('кто-то');
    expect(drafts.value(TITLE, 'Новая задача')).toBe('Новая задача');
  });

  test('смена экрана одной области не трогает другую', () => {
    const drafts = new FormDrafts();
    const side = { ...TITLE, region: 'side' } as const;
    drafts.track(side, 'Сыр');

    drafts.track({ ...TITLE, screen: CARD_ID, form: 'assign' }, 'кто-то');

    expect(drafts.value(side, 'x')).toBe('Сыр');
  });
});
