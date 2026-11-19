import { describe, expect, test } from 'bun:test';
import { CoreErrors, ErrorDef, err, ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import { ListTasksUcDef, TaskEvents } from 'dmg-core/testing/example';
import type { ActionView, FieldIssue, ScreenInstance } from 'dmg-ui';
import { ExampleUiSetDef, TASK_A, TASK_B } from 'dmg-ui/testing';
import { RuntimeKit, requestTrace } from 'dmg-ui/testing/fixtures';
import type { PageForm, PageFormField } from './page-form.types';
import { PageFormModel } from './page-form-model';
import type { PageEntered, PageViewState } from './page-view-state.types';

// Модель формы области: чистая функция состояния области — формы действий и
// локальных действий с подписями из Def, вариантами и начальными значениями
// из вида, введённым в отвергнутую форму и замечаниями по полям. Состояния —
// вид экземпляра списка и карточки на заглушках портов исполнителя: клиент
// и провод не нужны.

const model = () => new PageFormModel(ExampleUiSetDef);

const AT = Date.UTC(2026, 0, 1);
const LIMIT_TEXT = 'Слишком много открытых задач';

/** Открытая задача как строка выхода query UC — state целиком. */
const stateRow = (uuid: string, title: string) => ({
  uuid,
  createdAt: AT,
  updatedAt: AT,
  version: 1,
  ownerId: testUuid(1),
  title,
  status: 'open' as const,
});

const TITLE_ISSUE: FieldIssue = {
  field: 'title',
  text: 'Название не может быть пустым',
};

/** Состояние `ready` по виду экземпляра; отметки — поверх. */
const ready = (
  instance: ScreenInstance,
  marks: Partial<PageViewState> = {},
): PageViewState => {
  const view = instance.view();
  return {
    status: view.status,
    address: view.address,
    view,
    refreshing: false,
    issues: [],
    ...marks,
  };
};

const listed = async (
  kit = new RuntimeKit(),
  context: Parameters<RuntimeKit['openList']>[0] = {},
) => {
  const instance = await kit.openList(context);
  return { kit, instance, state: ready(instance) };
};

const formOf = (state: PageViewState, name: string): PageForm => {
  const form = model()
    .of(state)
    .forms.find((f) => f.name === name);
  if (form === undefined) throw new Error(`нет формы ${name}`);
  return form;
};

const fieldOf = (form: PageForm, name: string): PageFormField => {
  const field = form.fields.find((f) => f.name === name);
  if (field === undefined) throw new Error(`нет поля ${name}`);
  return field;
};

/** Состояние, в виде которого у действия `name` — ответ доступности `availability`. */
const withAction = (
  state: PageViewState,
  name: string,
  availability: ActionView['availability'],
): PageViewState => {
  const view = state.view;
  if (view === undefined) throw new Error('нет вида');
  return {
    ...state,
    view: {
      ...view,
      actions: view.actions.map((action) =>
        action.name === name ? { ...action, availability } : action,
      ),
    },
  };
};

/** Состояние с подменённым начальным значением поля `taskId` действия `open`. */
const withInitial = (state: PageViewState, initial: unknown): PageViewState => {
  const view = state.view;
  if (view === undefined) throw new Error('нет вида');
  return {
    ...state,
    view: {
      ...view,
      actions: view.actions.map((action) =>
        action.name === 'open'
          ? {
              ...action,
              fields: action.fields.map((field) => ({ ...field, initial })),
            }
          : action,
      ),
    },
  };
};

const entered = (
  kind: PageEntered['kind'],
  name: string,
  values: Record<string, string>,
): PageEntered => ({ kind, name, values });

describe('PageFormModel.of — формы вида экземпляра', () => {
  test('подписи действия и поля — из Def; primary — у основного действия', async () => {
    const { state } = await listed();

    const create = formOf(state, 'create');

    expect(create).toMatchObject({
      kind: 'action',
      name: 'create',
      label: 'Создать задачу',
      description: 'Новая задача в списке.',
      primary: true,
    });
    expect(fieldOf(create, 'title')).toMatchObject({
      name: 'title',
      label: 'Название задачи',
      optional: false,
    });
    expect(formOf(state, 'close').primary).toBe(false);
    expect(formOf(state, 'open').primary).toBe(false);
  });

  test('порядок — действия в порядке вида, затем локальные действия', async () => {
    const { state } = await listed();

    const forms = model().of(state).forms;

    expect(forms.map((form) => [form.kind, form.name])).toEqual([
      ['action', 'open'],
      ['action', 'create'],
      ['action', 'completeSelected'],
      ['action', 'jumpTo'],
      ['action', 'next'],
      ['action', 'prev'],
      ['action', 'close'],
      ['local', 'toggle'],
    ]);
  });

  test('локальное действие — подпись и описание из Def, не primary', async () => {
    const { state } = await listed();

    expect(formOf(state, 'toggle')).toMatchObject({
      kind: 'local',
      label: 'Отметить задачу',
      description: 'Добавляет задачу в выбор или убирает из него.',
      primary: false,
      available: true,
    });
  });

  test('действие без входа — форма без полей', async () => {
    const { state } = await listed();

    expect(formOf(state, 'close').fields).toEqual([]);
    expect(formOf(state, 'next').fields).toEqual([]);
  });

  test('модель не меняет состояние и не зависит от порядка вызовов: одно значение на одно состояние', async () => {
    const { state } = await listed();
    const before = JSON.stringify(state);

    expect(model().of(state)).toEqual(model().of(state));
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('PageFormModel.of — варианты и начальные значения', () => {
  test('варианты — подписи из данных страницы по порядку кода экрана', async () => {
    const { state } = await listed();

    expect(fieldOf(formOf(state, 'open'), 'taskId').choices).toEqual([
      'Хлеб',
      'Молоко',
    ]);
    expect(fieldOf(formOf(state, 'toggle'), 'taskId').choices).toEqual([
      'Хлеб',
      'Молоко',
    ]);
    expect(fieldOf(formOf(state, 'create'), 'title').choices).toBeUndefined();
  });

  test('после перечитывания с новыми данными — новые варианты', async () => {
    const kit = new RuntimeKit();
    const { instance } = await listed(kit);
    kit.ucs.answer(
      ListTasksUcDef,
      ok([stateRow(TASK_B, 'Сыр'), stateRow(TASK_A, 'Яйца')]),
    );

    kit.refresh.emit({
      event: TaskEvents.created.name,
      eventId: 'e-1',
      trace: { cause: { kind: 'event', eventId: 'e-1' }, correlationId: 'e-1' },
    });
    await instance.settled();

    expect(fieldOf(formOf(ready(instance), 'open'), 'taskId').choices).toEqual([
      'Сыр',
      'Яйца',
    ]);
  });

  test('начальное значение поля без вариантов — из кода экрана', async () => {
    const { state } = await listed();

    expect(fieldOf(formOf(state, 'create'), 'title').value).toBe(
      'Новая задача',
    );
  });

  test('поле без начального значения и без ввода — пустая строка', async () => {
    const { state } = await listed();

    expect(fieldOf(formOf(state, 'open'), 'taskId').value).toBe('');
    expect(fieldOf(formOf(state, 'toggle'), 'taskId').value).toBe('');
  });

  test('поле с вариантами: начальное — подпись варианта с этим value, а не само value', async () => {
    const { state } = await listed();

    const field = fieldOf(formOf(withInitial(state, TASK_B), 'open'), 'taskId');

    expect(field.value).toBe('Молоко');
    expect(field.choices).toContain(field.value);
  });

  test('начальное значение вне вариантов поля с вариантами — String для строки', async () => {
    const { state } = await listed();

    expect(
      fieldOf(formOf(withInitial(state, 'нет-такого'), 'open'), 'taskId').value,
    ).toBe('нет-такого');
  });

  test.each([
    ['число', 5, '5'],
    ['булево', true, 'true'],
    ['ложь', false, 'false'],
    ['объект', { a: 1 }, ''],
    ['null', null, ''],
  ])('начальное значение — %s: %j → %j', async (_name, initial, expected) => {
    const { state } = await listed();
    const view = state.view;
    if (view === undefined) throw new Error('нет вида');
    const patched: PageViewState = {
      ...state,
      view: {
        ...view,
        actions: view.actions.map((action) =>
          action.name === 'create'
            ? {
                ...action,
                fields: action.fields.map((field) => ({ ...field, initial })),
              }
            : action,
        ),
      },
    };

    expect(fieldOf(formOf(patched, 'create'), 'title').value).toBe(expected);
  });
});

describe('PageFormModel.of — доступность и подтверждение', () => {
  test('при stale offline недоступны все формы, в том числе локальные', async () => {
    const { state } = await listed();

    const forms = model().of({ ...state, stale: 'offline' }).forms;

    expect(forms.length).toBeGreaterThan(0);
    expect(forms.every((form) => !form.available)).toBe(true);
  });

  test('stale revision доступность не гасит', async () => {
    const { state } = await listed();

    expect(formOf({ ...state, stale: 'revision' }, 'create').available).toBe(
      true,
    );
  });

  test('available — из availability вида: доступно — true, отключено — false', async () => {
    const { state } = await listed();
    const off = { kind: 'disabled', text: 'Пока нельзя' } as const;
    const on = { kind: 'available' } as const;

    expect(formOf(withAction(state, 'create', off), 'create').available).toBe(
      false,
    );
    expect(formOf(withAction(state, 'close', on), 'close').available).toBe(
      true,
    );
  });

  test('локальное действие: availability вида решает available формы', async () => {
    const { state } = await listed();
    const view = state.view;
    if (view === undefined) throw new Error('нет вида');
    const off: PageViewState = {
      ...state,
      view: {
        ...view,
        locals: view.locals.map((local) => ({
          ...local,
          availability: { kind: 'disabled', text: 'Пока нельзя' } as const,
        })),
      },
    };

    expect(formOf(off, 'toggle').available).toBe(false);
  });

  test('скрытое действие — формы нет: без субъекта «Выполнить выбранные» не показано, владельцу — есть', async () => {
    const nobody = await listed(new RuntimeKit(), { subject: undefined });
    const own = await listed(new RuntimeKit());
    for (const { instance } of [nobody, own]) {
      await instance.local({ name: 'toggle', input: { taskId: TASK_A } });
    }

    const names = (instance: ScreenInstance) =>
      model()
        .of(ready(instance))
        .forms.map((form) => form.name);

    expect(names(nobody.instance)).not.toContain('completeSelected');
    expect(names(own.instance)).toContain('completeSelected');
  });

  test('причина: отключённое действие — available false и reason с текстом из вида', async () => {
    const { state } = await listed();
    const off = { kind: 'disabled', text: LIMIT_TEXT } as const;

    const form = formOf(withAction(state, 'create', off), 'create');

    expect(form.available).toBe(false);
    expect(form.reason).toBe(LIMIT_TEXT);
  });

  test('причина: отключённое локальное действие — reason с текстом из вида', async () => {
    const { state } = await listed();
    const view = state.view;
    if (view === undefined) throw new Error('нет вида');
    const off: PageViewState = {
      ...state,
      view: {
        ...view,
        locals: view.locals.map((local) => ({
          ...local,
          availability: { kind: 'disabled', text: 'Пока нельзя' } as const,
        })),
      },
    };

    expect(formOf(off, 'toggle')).toMatchObject({
      available: false,
      reason: 'Пока нельзя',
    });
  });

  test('причина: «Выполнить выбранные» без выбора — текст отключения кода экрана', async () => {
    const { state } = await listed();

    expect(formOf(state, 'completeSelected')).toMatchObject({
      available: false,
      reason: 'Отметьте открытые задачи',
    });
  });

  test('доступные действие и локальное действие — без reason', async () => {
    const { state } = await listed();

    expect(formOf(state, 'create').available).toBe(true);
    expect(formOf(state, 'create')).not.toHaveProperty('reason');
    expect(formOf(state, 'toggle')).not.toHaveProperty('reason');
  });

  test('причина: offline гасит available, но reason у доступного не появляется', async () => {
    const { state } = await listed();

    const form = formOf({ ...state, stale: 'offline' }, 'create');

    expect(form.available).toBe(false);
    expect(form).not.toHaveProperty('reason');
  });

  test('причина: expecting гасит available, но reason у доступного не появляется', async () => {
    const { state } = await listed();

    const form = formOf({ ...state, expected: true }, 'create');

    expect(form.available).toBe(false);
    expect(form).not.toHaveProperty('reason');
  });

  test('причина: у отключённого при offline и expecting reason — текст вида', async () => {
    const { state } = await listed();
    const off = { kind: 'disabled', text: LIMIT_TEXT } as const;
    const disabled = withAction(state, 'create', off);

    const offline = formOf({ ...disabled, stale: 'offline' }, 'create');
    const expecting = formOf({ ...disabled, expected: true }, 'create');

    expect(offline.reason).toBe(LIMIT_TEXT);
    expect(expecting.reason).toBe(LIMIT_TEXT);
  });

  test('подтверждение — свойство действия: тексты Def у completeSelected, у прочих нет', async () => {
    const { state } = await listed();

    expect(formOf(state, 'completeSelected').confirm).toEqual({
      label: 'Выполнить выбранные задачи?',
      description: 'Выполненную задачу нельзя вернуть в работу.',
    });
    for (const form of model().of(state).forms) {
      if (form.name !== 'completeSelected') {
        expect(form.confirm).toBeUndefined();
      }
    }
  });
});

describe('PageFormModel.of — другие статусы области', () => {
  const none = { forms: [], general: [] };

  test('empty — пустой набор', () => {
    expect(
      model().of({ status: 'empty', refreshing: false, issues: [] }),
    ).toEqual(none);
  });

  test('loading — пустой набор', () => {
    expect(
      model().of({
        status: 'loading',
        address: { screen: 'exampleUi/todo/taskList', params: { page: 0 } },
        refreshing: false,
        issues: [],
      }),
    ).toEqual(none);
  });

  test('refused — пустой набор', async () => {
    const kit = new RuntimeKit();
    kit.ucs.answer(
      ListTasksUcDef,
      err(
        ErrorDef.serialize(
          CoreErrors.ACCESS_DENIED.make({
            rule: 'canManageAll',
            denyMessage: 'Нет доступа.',
          }),
        ),
      ),
    );
    const state = ready(await kit.openList());

    expect(state.status).toBe('refused');
    expect(model().of(state)).toEqual(none);
  });

  test('замечания и введённое у пустой области формам не нужны — набор пуст', () => {
    expect(
      model().of({
        status: 'empty',
        refreshing: false,
        issues: [TITLE_ISSUE],
        entered: entered('action', 'create', { title: '' }),
      }),
    ).toEqual(none);
  });
});

describe('PageFormModel.of — введённое и замечания', () => {
  const rejected = async () => {
    const { instance, state } = await listed();
    const outcome = await instance.act({
      action: 'create',
      input: { title: '' },
      revision: instance.view().revision,
      confirmed: false,
      trace: requestTrace('r-1'),
    });
    if (outcome.kind !== 'rejected')
      throw new Error('вход должен быть отвергнут');
    return {
      ...state,
      issues: outcome.issues,
      entered: entered('action', 'create', { title: '' }),
    };
  };

  test('отвергнутый вход: замечание схемы — у поля, введённое пустое значение — в value, у других форм замечаний нет', async () => {
    const state = await rejected();

    const title = fieldOf(formOf(state, 'create'), 'title');

    expect(title.issues).toEqual(['Название не может быть пустым']);
    expect(title.value).toBe('');
    for (const form of model().of(state).forms) {
      if (form.name === 'create') continue;
      expect(form.issues).toEqual([]);
      for (const field of form.fields) expect(field.issues).toEqual([]);
    }
    expect(model().of(state).general).toEqual([]);
  });

  test('введённое — раньше начального: пустая строка не заменяется «Новая задача»', async () => {
    const { state } = await listed();

    const field = fieldOf(
      formOf(
        { ...state, entered: entered('action', 'create', { title: '' }) },
        'create',
      ),
      'title',
    );

    expect(field.value).toBe('');
  });

  test('введённое непустое — в value; ключа нет у поля — начальное значение', async () => {
    const { state } = await listed();

    const typed = formOf(
      { ...state, entered: entered('action', 'create', { title: 'Хлеб' }) },
      'create',
    );
    const missing = formOf(
      { ...state, entered: entered('action', 'create', {}) },
      'create',
    );

    expect(fieldOf(typed, 'title').value).toBe('Хлеб');
    expect(fieldOf(missing, 'title').value).toBe('Новая задача');
  });

  test('эхо называет форму create: чужие ключи значений отфильтрованы — их нет ни в одном поле', async () => {
    const { state } = await listed();
    const echo = entered('action', 'create', {
      title: 'Хлеб',
      secret: 'не показывать',
    });

    const forms = model().of({ ...state, entered: echo }).forms;

    const create = forms.find((form) => form.name === 'create');
    expect(create?.fields.map((field) => field.name)).toEqual(['title']);
    expect(JSON.stringify(forms)).not.toContain('не показывать');
  });

  test('эхо чужой формы не меняет значения остальных форм', async () => {
    const { state } = await listed();
    const echo = entered('action', 'create', { title: 'Хлеб' });

    const forms = model().of({ ...state, entered: echo }).forms;

    expect(
      fieldOf(forms.find((f) => f.name === 'open') as PageForm, 'taskId').value,
    ).toBe('');
    expect(
      fieldOf(forms.find((f) => f.name === 'toggle') as PageForm, 'taskId')
        .value,
    ).toBe('');
  });

  test('эхо локального действия называет локальную форму, а не действие с тем же именем', async () => {
    const { state } = await listed();
    const echo = entered('local', 'toggle', { taskId: 'нет' });

    const forms = model().of({
      ...state,
      issues: [{ field: 'taskId', text: 'Неверный идентификатор' }],
      entered: echo,
    }).forms;

    const local = forms.find((form) => form.kind === 'local');
    expect(local && fieldOf(local, 'taskId')).toMatchObject({
      value: 'нет',
      issues: ['Неверный идентификатор'],
    });
    const open = forms.find((form) => form.name === 'open');
    expect(open && fieldOf(open, 'taskId').issues).toEqual([]);
  });

  test('замечание без поля при названной форме — в issues формы', async () => {
    const { state } = await listed();

    const set = model().of({
      ...state,
      issues: [{ text: 'Список закрыт для записи' }],
      entered: entered('action', 'create', { title: 'Хлеб' }),
    });

    expect(set.forms.find((f) => f.name === 'create')?.issues).toEqual([
      'Список закрыт для записи',
    ]);
    expect(set.general).toEqual([]);
    expect(
      fieldOf(set.forms.find((f) => f.name === 'create') as PageForm, 'title')
        .issues,
    ).toEqual([]);
  });

  test('замечания без названной формы (эха нет) — в general, с полем и без', async () => {
    const { state } = await listed();

    const set = model().of({
      ...state,
      issues: [TITLE_ISSUE, { text: 'Общая беда' }],
    });

    expect(set.general).toEqual([
      'Название не может быть пустым',
      'Общая беда',
    ]);
    for (const form of set.forms) {
      expect(form.issues).toEqual([]);
      for (const field of form.fields) expect(field.issues).toEqual([]);
    }
  });

  test('несколько замечаний к одному полю — все, по порядку', async () => {
    const { state } = await listed();

    const title = fieldOf(
      formOf(
        {
          ...state,
          issues: [
            { field: 'title', text: 'Первое' },
            { field: 'title', text: 'Второе' },
          ],
          entered: entered('action', 'create', { title: 'x' }),
        },
        'create',
      ),
      'title',
    );

    expect(title.issues).toEqual(['Первое', 'Второе']);
  });
});

describe('PageFormModel.of — привязка замечаний к форме', () => {
  /** Локальное действие переименовано в `create`: действие и локальное с одним именем. */
  const sameName = (state: PageViewState): PageViewState => {
    const view = state.view;
    if (view === undefined) throw new Error('нет вида');
    return {
      ...state,
      view: {
        ...view,
        locals: view.locals.map((local) => ({ ...local, name: 'create' })),
      },
    };
  };

  test('действие и локальное с одним именем: эхо называет локальное — замечание только у него', async () => {
    const { state } = await listed();

    const forms = model().of({
      ...sameName(state),
      issues: [{ text: 'Беда локального' }],
      entered: entered('local', 'create', {}),
    }).forms;

    expect(
      forms.find((f) => f.kind === 'local' && f.name === 'create')?.issues,
    ).toEqual(['Беда локального']);
    expect(
      forms.find((f) => f.kind === 'action' && f.name === 'create')?.issues,
    ).toEqual([]);
  });

  test('замечание без поля — только у названной формы, у прочих пусто', async () => {
    const { state } = await listed();

    const forms = model().of({
      ...state,
      issues: [{ text: 'Беда' }],
      entered: entered('action', 'create', {}),
    }).forms;

    for (const form of forms) {
      expect(form.issues).toEqual(form.name === 'create' ? ['Беда'] : []);
    }
  });

  test('замечание с полем — только в поле, issues формы пуст', async () => {
    const { state } = await listed();

    const create = formOf(
      {
        ...state,
        issues: [TITLE_ISSUE],
        entered: entered('action', 'create', { title: '' }),
      },
      'create',
    );

    expect(create.issues).toEqual([]);
    expect(fieldOf(create, 'title').issues).toEqual([TITLE_ISSUE.text]);
  });

  test('замечание к полю, которого у названной формы нет, остаётся в issues формы', async () => {
    const { state } = await listed();

    const set = model().of({
      ...state,
      issues: [{ field: 'нет-поля', text: 'Чужое поле' }],
      entered: entered('action', 'create', {}),
    });

    expect(set.forms.find((f) => f.name === 'create')?.issues).toEqual([
      'Чужое поле',
    ]);
    expect(set.general).toEqual([]);
  });

  test('эхо называет несуществующую форму — замечание в general, формы без замечаний', async () => {
    const { state } = await listed();

    const set = model().of({
      ...state,
      issues: [TITLE_ISSUE],
      entered: entered('action', 'нет-такой', { title: '' }),
    });

    expect(set.general).toEqual([TITLE_ISSUE.text]);
    for (const form of set.forms) {
      expect(form.issues).toEqual([]);
      for (const field of form.fields) expect(field.issues).toEqual([]);
    }
  });

  test('optional — признак поля из вида: необязательное true, обязательное false', async () => {
    const { state } = await listed();
    const view = state.view;
    if (view === undefined) throw new Error('нет вида');
    const patched: PageViewState = {
      ...state,
      view: {
        ...view,
        actions: view.actions.map((action) =>
          action.name === 'open'
            ? {
                ...action,
                fields: action.fields.map((f) => ({ ...f, optional: true })),
              }
            : action,
        ),
      },
    };

    expect(fieldOf(formOf(patched, 'open'), 'taskId').optional).toBe(true);
    expect(fieldOf(formOf(patched, 'create'), 'title').optional).toBe(false);
  });
});

describe('PageFormModel.of — ожидаемый итог', () => {
  test('expected — формы действий недоступны, локальные — как в виде', async () => {
    const { state } = await listed();

    const forms = model().of({ ...state, expected: true }).forms;

    const actions = forms.filter((form) => form.kind === 'action');
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((form) => !form.available)).toBe(true);
    expect(formOf({ ...state, expected: true }, 'toggle').available).toBe(
      formOf(state, 'toggle').available,
    );
    expect(formOf(state, 'toggle').available).toBe(true);
  });
});

describe('PageFormModel.of — вид, подсказка, пример и пределы поля', () => {
  test('поле со всеми частями описания: kind, hint, example, limits из вида', async () => {
    const { state } = await listed();

    const part = fieldOf(formOf(state, 'jumpTo'), 'part');

    expect(part).toMatchObject({
      name: 'part',
      label: 'Часть',
      kind: 'number',
      optional: false,
      hint: 'Номер части списка, с первой',
      example: 2,
      limits: { min: 1, max: 99, integer: true },
    });
  });

  test('строковое поле с подсказкой и примером: kind string, предел — непустая строка', async () => {
    const { state } = await listed();

    const title = fieldOf(formOf(state, 'create'), 'title');

    expect(title).toMatchObject({
      kind: 'string',
      hint: 'Коротко: что нужно сделать',
      example: 'Купить хлеб',
    });
    expect(title.limits).toEqual({ minLength: 1 });
  });

  test('поле без подсказки, примера и пределов — ключей hint, example, limits нет', async () => {
    const { state } = await listed();

    const task = fieldOf(formOf(state, 'open'), 'taskId');

    expect(task).toHaveProperty('kind');
    expect(task).not.toHaveProperty('hint');
    expect(task).not.toHaveProperty('example');
    expect(task).not.toHaveProperty('limits');
  });

  test('поле формы — данные JSON: после круга через JSON описание то же', async () => {
    const { state } = await listed();

    const part = fieldOf(formOf(state, 'jumpTo'), 'part');

    expect(JSON.parse(JSON.stringify(part))).toEqual(part);
  });

  test('введённое в отвергнутую форму числовое поле остаётся строкой, как набрано', async () => {
    const { state } = await listed();

    const form = formOf(
      {
        ...state,
        issues: [{ field: 'part', text: 'Введите номер части' }],
        entered: entered('action', 'jumpTo', { part: 'abc' }),
      },
      'jumpTo',
    );

    expect(fieldOf(form, 'part')).toMatchObject({
      value: 'abc',
      issues: ['Введите номер части'],
    });
  });
});
