import { describe, expect, test } from 'bun:test';
import { DomainRuleDef, ErrorDef, ok } from 'dmg-core';
import { testUuid } from 'dmg-core/testing';
import {
  type ExampleUser,
  TaskAr,
  TaskPolicy,
  TaskRules,
} from 'dmg-core/testing/example';
import { TASK_A, TASK_B } from '../../testing/example';
import { taskState } from '../../testing/task-state';
import { Availability } from './availability';

// Ответ «три исхода» о действии экрана: доступно, скрыто, отключено с
// текстом. Помощники собирают его из домена на клиенте (Policy и правила
// над `TaskAr.readonly`), признака из ответа query UC и своего условия.

const OWNER = testUuid(1);
const OTHER = testUuid(2);
const ADMIN = testUuid(3);
const TASK_C = testUuid(4);
const AVAILABLE = { kind: 'available' } as const;
const HIDDEN = { kind: 'hidden' } as const;
const owner: ExampleUser = { uuid: OWNER, hasRole: () => false };
const other: ExampleUser = { uuid: OTHER, hasRole: () => false };
const admin: ExampleUser = { uuid: ADMIN, hasRole: (role) => role === 'admin' };

const taskOf = (status: 'open' | 'done', ownerId = OWNER) =>
  TaskAr.readonly(taskState({ uuid: TASK_A, title: 'Хлеб', status, ownerId }));

const open = (uuid: string) =>
  TaskAr.readonly(taskState({ uuid, title: uuid, status: 'open' }));

describe('Availability — значения', () => {
  test('yes — доступно, hidden — скрыто без текста, disabled — отключено с текстом', () => {
    expect(Availability.yes()).toEqual(AVAILABLE);
    expect(Availability.hidden()).toStrictEqual(HIDDEN);
    expect(Availability.disabled('Пока нельзя')).toEqual({
      kind: 'disabled',
      text: 'Пока нельзя',
    });
  });
});

describe('Availability.when — своё условие', () => {
  test('условие верно — доступно', () => {
    expect(Availability.when(true, 'Нельзя')).toEqual(AVAILABLE);
  });

  test('условие неверно — отключено с текстом автора', () => {
    expect(Availability.when(false, 'Задач нет')).toEqual({
      kind: 'disabled',
      text: 'Задач нет',
    });
  });

  test('основание «своё условие»: решает выражение кода экрана', () => {
    const selected: string[] = [];

    const answer = Availability.when(selected.length > 0, 'Ничего не выбрано');

    expect(answer).toEqual({ kind: 'disabled', text: 'Ничего не выбрано' });
  });

  test('основание «признак из ответа query UC»: решает поле ответа', () => {
    const answered = { hasMore: false };

    expect(Availability.when(answered.hasMore, 'Дальше нет').kind).toBe(
      'disabled',
    );
    expect(Availability.when(!answered.hasMore, 'Дальше есть').kind).toBe(
      'available',
    );
  });
});

describe('Availability.policy — домен на клиенте, Policy', () => {
  const canManage = TaskPolicy.rules.canManage;

  test('основание «домен на клиенте»: владелец и администратор — доступно', () => {
    const task = taskOf('open');

    expect(Availability.policy(canManage, owner, { task })).toEqual(AVAILABLE);
    expect(Availability.policy(canManage, admin, { task })).toEqual(AVAILABLE);
  });

  test('чужой — скрыто: текст denyMessage не идёт', () => {
    const answer = Availability.policy(canManage, other, {
      task: taskOf('open'),
    });

    expect(answer).toStrictEqual(HIDDEN);
  });

  test('субъекта нет — скрыто', () => {
    const answer = Availability.policy(canManage, undefined, {
      task: taskOf('open'),
    });

    expect(answer).toStrictEqual(HIDDEN);
  });

  test('набор задач: владелец всех — доступно, чужая среди них — скрыто, администратор — доступно', () => {
    const rule = TaskPolicy.rules.canManageAll;
    const mixed = [taskOf('open'), taskOf('open', OTHER)];

    expect(
      Availability.policy(rule, owner, { tasks: [taskOf('open')] }),
    ).toEqual(AVAILABLE);
    expect(Availability.policy(rule, owner, { tasks: mixed })).toStrictEqual(
      HIDDEN,
    );
    expect(Availability.policy(rule, admin, { tasks: mixed })).toEqual(
      AVAILABLE,
    );
  });
});

describe('Availability.rule — домен на клиенте, правило домена', () => {
  const limit = TaskRules.rules.withinOpenLimit;

  test('основание «домен на клиенте»: три открытых — отключено, текст ошибки, без payload', () => {
    const ownerTasks = [open(TASK_A), open(TASK_B), open(TASK_C)];

    const answer = Availability.rule(limit, { ownerTasks });

    expect(answer).toStrictEqual({
      kind: 'disabled',
      text: 'Слишком много открытых задач',
    });
  });

  test('меньше трёх открытых — доступно', () => {
    const answer = Availability.rule(limit, {
      ownerTasks: [open(TASK_A), open(TASK_B)],
    });

    expect(answer).toEqual(AVAILABLE);
  });

  test('выполненные задачи предел не считают', () => {
    const done = TaskAr.readonly(
      taskState({ uuid: TASK_C, title: 'Сыр', status: 'done' }),
    );

    const answer = Availability.rule(limit, {
      ownerTasks: [open(TASK_A), open(TASK_B), done],
    });

    expect(answer).toEqual(AVAILABLE);
  });

  test('ошибка вида access — скрыто: это «нет прав», текст ошибки не уходит', () => {
    const ShelfErrors = ErrorDef.define('SHELF', {
      LOCKED: {
        kind: 'access',
        label: 'Полка чужая',
        description: 'Ставить книги может только хозяин полки.',
      },
    });
    const own = DomainRuleDef.define({
      name: 'ownShelf',
      label: 'Своя полка',
      description: 'Книгу ставит хозяин полки.',
      error: ShelfErrors.LOCKED,
      check: (ctx: { readonly mine: boolean }) =>
        ctx.mine ? ok() : ShelfErrors.LOCKED.err(),
    });

    expect(Availability.rule(own, { mine: false })).toStrictEqual(HIDDEN);
    expect(Availability.rule(own, { mine: true })).toEqual(AVAILABLE);
  });
});

describe('Availability.given — контекст может быть не собран', () => {
  test('контекста нет — отключено с текстом автора, then не вызван', () => {
    let called = 0;

    const answer = Availability.given(undefined, 'Отметьте задачи', () => {
      called += 1;
      return Availability.yes();
    });

    expect(answer).toEqual({ kind: 'disabled', text: 'Отметьте задачи' });
    expect(called).toBe(0);
  });

  test('контекст есть — then получает его и решает ответ', () => {
    const seen: unknown[] = [];

    const answer = Availability.given({ tasks: [1, 2] }, 'Отметьте', (ctx) => {
      seen.push(ctx);
      return Availability.hidden();
    });

    expect(answer).toStrictEqual(HIDDEN);
    expect(seen).toEqual([{ tasks: [1, 2] }]);
  });
});

describe('Availability.all — сводка частей', () => {
  const off = (text: string) => Availability.disabled(text);

  test('все доступны — доступно', () => {
    expect(Availability.all(Availability.yes(), Availability.yes())).toEqual(
      AVAILABLE,
    );
  });

  test('скрытое побеждает отключённое в любом порядке', () => {
    const before = Availability.all(off('Первое'), Availability.hidden());
    const after = Availability.all(Availability.hidden(), off('Первое'));

    expect(before).toStrictEqual(HIDDEN);
    expect(after).toStrictEqual(HIDDEN);
  });

  test('несколько отключённых — текст первого по порядку', () => {
    const answer = Availability.all(
      Availability.yes(),
      off('Первое'),
      off('Второе'),
    );

    expect(answer).toEqual({ kind: 'disabled', text: 'Первое' });
  });

  test('частей нет — доступно', () => {
    expect(Availability.all()).toEqual(AVAILABLE);
  });

  test('карточка задачи: чужая выполненная — скрыто, своя выполненная — отключено', () => {
    const answerFor = (subject: ExampleUser, ownerId: string) => {
      const task = taskOf('done', ownerId);
      return Availability.all(
        Availability.policy(TaskPolicy.rules.canManage, subject, { task }),
        Availability.when(task.isOpen(), 'Задача уже выполнена'),
      );
    };

    expect(answerFor(other, OWNER)).toStrictEqual(HIDDEN);
    expect(answerFor(owner, OWNER)).toEqual({
      kind: 'disabled',
      text: 'Задача уже выполнена',
    });
  });
});
