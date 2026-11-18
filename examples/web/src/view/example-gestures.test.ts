import { describe, expect, test } from 'bun:test';
import { testUuid, useTempDir } from 'dmg-core/testing';
import type { ExampleUser } from 'dmg-core/testing/example';
import type { AddressJson, UiFault } from 'dmg-ui';
import type { UcDispatch, UcRequest } from 'dmg-ui/server';
import { ASSIGNED_ID, CARD_ID, TaskCardScreenDef } from 'dmg-ui/testing';
import type { PageInboxEntry, PageViewState } from 'dmg-ui/web-ui';
import * as v from 'valibot';
import {
  type ExampleTab,
  exampleWorld,
  flush,
  openTab,
  personOf,
  settle,
  TOKEN_ANNA,
  TOKEN_BORIS,
} from '../testing/example-world';
import { ExampleGestures, type GesturePort } from './example-gestures';
import { exampleWebViews } from './example-views';
import { completed } from './expected';
import { InboxModel } from './inbox-model';
import { RegionFrame } from './region-frame';
import type { RegionModel } from './region-model.types';

// Жесты и действия человека на настоящем клиенте над сервером в памяти:
// открыть, выполнить с итогом до ответа, отметить, форма, подтверждение,
// ссылка. Ответ сервера удерживает подставной бэкенд вызова UC: ожидание —
// событием «вызов дошёл до сервера», без таймеров.

const tmp = useTempDir('example-web-gestures-');

const EXPECTING = 'Ждём ответа…';

/**
 * Бэкенд вызова UC с удержанием: `hold(uc)` — следующий вызов этого UC ждёт
 * `release(uc)`, остальные идут сразу; `arrived(uc)` — вызов дошёл до сервера.
 */
class GatedDispatch implements UcDispatch<ExampleUser> {
  readonly calls: string[] = [];
  private readonly held = new Set<string>();
  private readonly gates = new Map<string, PromiseWithResolvers<void>>();
  private readonly waiters = new Map<string, PromiseWithResolvers<void>>();

  constructor(private readonly inner: UcDispatch<ExampleUser>) {}

  hold(uc: string): void {
    this.held.add(uc);
    this.gates.set(uc, Promise.withResolvers<void>());
  }

  release(uc: string): void {
    this.gates.get(uc)?.resolve();
  }

  arrived(uc: string): Promise<void> {
    return this.waiter(uc).promise;
  }

  async dispatch(request: UcRequest<ExampleUser>) {
    const name = request.uc.name;
    this.calls.push(name);
    if (this.held.delete(name)) {
      this.waiter(name).resolve();
      await this.gates.get(name)?.promise;
    }
    return this.inner.dispatch(request);
  }

  count(uc: string): number {
    return this.calls.filter((name) => name === uc).length;
  }

  private waiter(uc: string): PromiseWithResolvers<void> {
    const found = this.waiters.get(uc);
    if (found !== undefined) return found;
    const created = Promise.withResolvers<void>();
    this.waiters.set(uc, created);
    return created;
  }
}

/** Мир с удерживающим бэкендом; `gate` доступен до первого вызова. */
const gatedWorld = () => {
  let gate: GatedDispatch | undefined;
  const w = exampleWorld(tmp().path, (inner) => {
    gate = new GatedDispatch(inner);
    return gate;
  });
  if (gate === undefined) throw new Error('бэкенд не создан');
  return { w, gate };
};

/** Название и ревизия задач списка человека как видит их `main`. */
const tasksOf = (state: PageViewState) => {
  const data = v.parse(
    v.object({
      tasks: v.array(
        v.object({ uuid: v.string(), title: v.string(), status: v.string() }),
      ),
    }),
    state.view?.data,
  );
  return data.tasks;
};

const revisionOf = (state: PageViewState): number => {
  const revision = state.view?.revision;
  if (revision === undefined) throw new Error('нет вида');
  return revision;
};

const statusOf = (state: PageViewState): unknown =>
  v.parse(v.object({ status: v.string() }), state.view?.data).status;

/** Вкладка Анны: список в `main`, задачи по названиям созданы, карточка первой — в `side`. */
const annaWith = async (
  w: ReturnType<typeof exampleWorld>,
  titles: string[],
  faults?: (fault: UiFault) => void,
) => {
  const tab = await openTab(w, TOKEN_ANNA, 'a', faults);
  await tab.client.route('/');
  for (const title of titles) {
    await tab.client.submit('main', 'create', { title });
  }
  await settle(w, tab);
  return tab;
};

const reporting = () => {
  const reports: string[] = [];
  return { reports, report: (text: string) => reports.push(text) };
};

/** Карточка задачи `title` в `side` вкладки: адрес по uuid строки списка. */
const cardOf = async (tab: ExampleTab, title: string) => {
  const row = tasksOf(tab.client.region('main')).find((t) => t.title === title);
  if (row === undefined) throw new Error(`нет задачи ${title}`);
  const g = new ExampleGestures(tab.client, () => {});
  await g.openTask(row.uuid, revisionOf(tab.client.region('main')));
  return row.uuid;
};

const frameOf = (tab: ExampleTab, region: 'main' | 'side' | 'modal') =>
  new RegionFrame().next(tab.client.region(region));

const everythingDisabled = (model: RegionModel): boolean => {
  const body = model.body;
  if (body?.kind !== 'card') return false;
  return (
    !body.draggable &&
    !body.dropEnabled &&
    body.actions.every((action) => !action.enabled) &&
    body.forms.every((form) => !form.enabled)
  );
};

describe('ExampleGestures.openTask — открыть карточку', () => {
  test('из main: moved, карточка в side, список на месте', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    const { reports, report } = reporting();
    const g = new ExampleGestures(a.client, report);

    const outcome = await g.openTask(
      row.uuid,
      revisionOf(a.client.region('main')),
    );

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(a.client.region('side').view?.screen).toBe(CARD_ID);
    expect(a.client.region('main').view?.screen).not.toBe(CARD_ID);
    expect(reports).toEqual([]);
  });

  test('устаревшая ревизия: stale и заметка, карточка не открыта', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    const g = new ExampleGestures(a.client, () => {});

    const outcome = await g.openTask(
      row.uuid,
      revisionOf(a.client.region('main')) - 1,
    );

    expect(outcome).toMatchObject({ kind: 'stale' });
    expect(a.client.region('main').note).toBeTruthy();
    expect(a.client.region('side').status).toBe('empty');
  });
});

describe('ExampleGestures.completeTask — выполнить с итогом до ответа', () => {
  const opened = async () => {
    const { w, gate } = gatedWorld();
    const faults: UiFault[] = [];
    const a = await annaWith(w, ['Хлеб'], (fault) => faults.push(fault));
    await cardOf(a, 'Хлеб');
    await settle(w, a);
    const { reports, report } = reporting();
    return {
      w,
      gate,
      a,
      faults,
      reports,
      g: new ExampleGestures(a.client, report),
    };
  };

  test('сразу после вызова, до ответа: expected, данные — «выполнена», модель — «выполнена» и «Ждём ответа…», управление отключено', async () => {
    const { gate, a, g } = await opened();
    gate.hold('completeTask');

    const acting = g.completeTask('side', revisionOf(a.client.region('side')));

    const state = a.client.region('side');
    expect(state.expected).toBe(true);
    expect(statusOf(state)).toBe('done');
    const model = frameOf(a, 'side');
    expect(model.marks).toEqual([EXPECTING]);
    expect(model.busy).toBe(true);
    expect(model.body).toMatchObject({ kind: 'card', done: true });
    expect(everythingDisabled(model)).toBe(true);
    await gate.arrived('completeTask');
    gate.release('completeTask');
    await acting;
  });

  test('после ответа: expected нет, ревизия выросла, данные сервера «выполнена»', async () => {
    const { w, gate, a, g } = await opened();
    const before = revisionOf(a.client.region('side'));
    gate.hold('completeTask');

    const acting = g.completeTask('side', before);
    await gate.arrived('completeTask');
    gate.release('completeTask');
    const outcome = await acting;

    expect(outcome).toMatchObject({ kind: 'stayed' });
    const state = a.client.region('side');
    expect(state.expected).toBeUndefined();
    expect(revisionOf(state)).toBeGreaterThan(before);
    expect(statusOf(state)).toBe('done');
    await settle(w, a);
    expect(frameOf(a, 'side').marks).toEqual([]);
  });

  test('итог проходит схему данных экрана: сбоев клиента нет', async () => {
    const { gate, a, g, faults } = await opened();
    gate.hold('completeTask');

    const acting = g.completeTask('side', revisionOf(a.client.region('side')));
    await gate.arrived('completeTask');
    gate.release('completeTask');
    await acting;

    expect(faults).toEqual([]);
  });

  test('второе действие, пока ждём: unavailable disabled, вызова на сервер нет', async () => {
    const { gate, a, g } = await opened();
    gate.hold('completeTask');
    const rev = revisionOf(a.client.region('side'));

    const first = g.completeTask('side', rev);
    await gate.arrived('completeTask');
    const second = await g.completeTask('side', rev);

    expect(second).toMatchObject({ kind: 'unavailable', reason: 'disabled' });
    gate.release('completeTask');
    await first;
    expect(gate.count('completeTask')).toBe(1);
  });

  test('пока ждём, локальное действие main и соседняя область работают', async () => {
    const { gate, a, g } = await opened();
    gate.hold('completeTask');
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');

    const first = g.completeTask('side', revisionOf(a.client.region('side')));
    await gate.arrived('completeTask');
    const toggled = await g.toggleTask(row.uuid);

    expect(toggled).toMatchObject({ kind: 'changed' });
    expect(frameOf(a, 'main').busy).toBe(false);
    gate.release('completeTask');
    await first;
  });
});

describe('completed — ожидаемый итог карточки', () => {
  test('данные карточки со статусом «выполнена»; полученные данные не меняются', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    await cardOf(a, 'Хлеб');
    const view = a.client.region('side').view;
    if (view === undefined) throw new Error('нет вида');
    const before = JSON.stringify(view);

    const result = completed(view);

    expect(result).toMatchObject({ title: 'Хлеб', status: 'done' });
    expect(v.safeParse(TaskCardScreenDef.data, result).success).toBe(true);
    expect(JSON.stringify(view)).toBe(before);
  });
});

describe('ExampleGestures.completeTask — отказ: вторая вкладка выполнила раньше', () => {
  test('наложения нет, заметка отказа, данные сервера «выполнена»; итог и заметка отказа вместе не показаны', async () => {
    const { w, gate } = gatedWorld();
    const first = await annaWith(w, ['Хлеб']);
    await cardOf(first, 'Хлеб');
    const second = await openTab(w, TOKEN_ANNA, 'a2');
    await second.client.route('/');
    await cardOf(second, 'Хлеб');
    await settle(w, first, second);
    const log: PageViewState[] = [];
    first.client.source('side').subscribe((state) => log.push(state));
    const g = new ExampleGestures(first.client, () => {});
    gate.hold('completeTask');

    const acting = g.completeTask(
      'side',
      revisionOf(first.client.region('side')),
    );
    await gate.arrived('completeTask');
    const other = await second.client.submit('side', 'complete', {});
    expect(other).toMatchObject({ kind: 'stayed' });
    gate.release('completeTask');
    const outcome = await acting;
    await settle(w, first, second);

    expect(outcome).toMatchObject({ kind: 'refused' });
    const state = first.client.region('side');
    expect(state.expected).toBeUndefined();
    expect(statusOf(state)).toBe('done');
    expect(state.note).toBeTruthy();
    expect(log.some((entry) => entry.expected === true)).toBe(true);
    expect(
      log.some((entry) => entry.expected === true && entry.note !== undefined),
    ).toBe(false);
    expect(frameOf(first, 'side').marks).toEqual([]);
  });
});

describe('ExampleGestures.toggleTask — отметка по uuid', () => {
  test('две задачи с одним названием: отмечена только вторая', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Сыр', 'Сыр']);
    const rows = tasksOf(a.client.region('main'));
    const second = rows[1];
    expect(rows.map((row) => row.title)).toEqual(['Сыр', 'Сыр']);
    if (second === undefined) throw new Error('нет второй строки');
    const g = new ExampleGestures(a.client, () => {});

    const outcome = await g.toggleTask(second.uuid);

    expect(outcome).toMatchObject({ kind: 'changed' });
    const model = frameOf(a, 'main');
    expect(model.body?.kind).toBe('list');
    if (model.body?.kind === 'list') {
      expect(model.body.rows.map((row) => row.selected)).toEqual([false, true]);
    }
  });

  test('повторная отметка снимает выбор', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    const g = new ExampleGestures(a.client, () => {});

    await g.toggleTask(row.uuid);
    await g.toggleTask(row.uuid);

    const model = frameOf(a, 'main');
    if (model.body?.kind === 'list') {
      expect(model.body.rows.map((r) => r.selected)).toEqual([false]);
    } else {
      throw new Error('ожидался список');
    }
  });

  test('без связи: unavailable и заметка в области', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    const g = new ExampleGestures(a.client, () => {});
    a.end.close();
    await flush();

    const outcome = await g.toggleTask(row.uuid);

    expect(a.client.region('main').stale).toBe('offline');
    expect(outcome).toMatchObject({ kind: 'unavailable' });
    expect(a.client.region('main').note).toBeTruthy();
  });
});

describe('ExampleGestures — формы и подтверждение', () => {
  test('submitForm: создание — выход created, список с задачей и заметкой «Задача создана»', async () => {
    const { w } = gatedWorld();
    const a = await openTab(w, TOKEN_ANNA, 'a');
    await a.client.route('/');
    const g = new ExampleGestures(a.client, () => {});

    const outcome = await g.submitForm('main', 'create', { title: 'Хлеб' });

    expect(outcome).toMatchObject({ kind: 'exited', exit: 'created' });
    expect(a.client.region('main').note).toBe('Задача создана');
    expect(tasksOf(a.client.region('main')).map((t) => t.title)).toEqual([
      'Хлеб',
    ]);
  });

  test('пустое название: rejected, замечание по полю в модели, введённое на месте', async () => {
    const { w } = gatedWorld();
    const a = await openTab(w, TOKEN_ANNA, 'a');
    await a.client.route('/');
    const g = new ExampleGestures(a.client, () => {});

    const outcome = await g.submitForm('main', 'create', { title: '' });

    expect(outcome).toMatchObject({ kind: 'rejected' });
    const model = frameOf(a, 'main');
    const create =
      model.body?.kind === 'list'
        ? model.body.forms.find((form) => form.name === 'create')
        : undefined;
    expect(create?.fields[0]?.issues).toEqual([
      'Название не может быть пустым',
    ]);
    expect(tasksOf(a.client.region('main'))).toEqual([]);
  });

  test('«Выполнить выбранные»: вопрос в модели, затем confirm — задача выполнена', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    const row = tasksOf(a.client.region('main'))[0];
    if (row === undefined) throw new Error('нет строки');
    const g = new ExampleGestures(a.client, () => {});
    await g.toggleTask(row.uuid);

    const asked = await g.runAction(
      'main',
      'completeSelected',
      revisionOf(a.client.region('main')),
    );

    expect(asked).toMatchObject({ kind: 'confirm' });
    const question = frameOf(a, 'main').confirm;
    expect(question?.action).toBe('completeSelected');
    expect(question?.label).toBeTruthy();

    const done = await g.confirm('main');

    expect(done).toMatchObject({ kind: 'stayed' });
    expect(tasksOf(a.client.region('main'))[0]?.status).toBe('done');
    expect(frameOf(a, 'main').confirm).toBeUndefined();
  });

  test('runAction без полей: «Дальше» — переход на следующую страницу', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб', 'Молоко', 'Сыр']);
    const g = new ExampleGestures(a.client, () => {});

    const outcome = await g.runAction(
      'main',
      'next',
      revisionOf(a.client.region('main')),
    );

    expect(outcome).toMatchObject({ kind: 'moved' });
    expect(a.client.region('main').address).toMatchObject({
      params: { page: 1 },
    });
  });
});

describe('ExampleGestures — ссылки и закрытие', () => {
  test('openLink ссылки уведомления: окно modal, «Назначенные мне»', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    const g = new ExampleGestures(a.client, () => {});
    const link: AddressJson = { screen: ASSIGNED_ID, params: {} };

    await g.openLink(link);

    expect(a.client.region('modal').view?.screen).toBe(ASSIGNED_ID);
  });

  test('closeRegion(side): область пуста', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    await cardOf(a, 'Хлеб');
    const g = new ExampleGestures(a.client, () => {});

    g.closeRegion('side');
    await settle(w, a);

    expect(a.client.region('side').status).toBe('empty');
  });

  test('follow: переход внутри страницы по пути — «Назначенные мне» в main', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, []);
    const g = new ExampleGestures(a.client, () => {});

    await g.follow('/assigned');

    expect(a.client.region('main').view?.screen).toBe(ASSIGNED_ID);
  });
});

describe('ExampleGestures — делегирование порту клиента', () => {
  /** Аргументы без хвоста из `undefined`: необязательный аргумент не передан или передан пустым — одно и то же. */
  const trimmed = (args: unknown[]): unknown[] => {
    const copy = [...args];
    while (copy.length > 0 && copy[copy.length - 1] === undefined) copy.pop();
    return copy;
  };

  /** Порт, записывающий вызовы: имя и аргументы. */
  const recording = () => {
    const calls: [string, ...unknown[]][] = [];
    const answer = { kind: 'stayed', revision: 1 };
    const method =
      (name: string) =>
      async (...args: unknown[]) => {
        calls.push([name, ...trimmed(args)]);
        return answer;
      };
    const port = {
      submitInput: method('submitInput'),
      submit: method('submit'),
      local: method('local'),
      confirm: method('confirm'),
      close: (...args: unknown[]) => {
        calls.push(['close', ...trimmed(args)]);
      },
      retry: method('retry'),
      openLink: method('openLink'),
      route: method('route'),
    } as unknown as GesturePort;
    return { calls, port };
  };

  const ID = testUuid(7);

  test('openTask: submitInput main/open со значением варианта и ревизией, без итога', async () => {
    const { calls, port } = recording();

    await new ExampleGestures(port, () => {}).openTask(ID, 3);

    expect(calls).toEqual([['submitInput', 'main', 'open', { taskId: ID }, 3]]);
  });

  test('completeTask: submitInput complete без входа, с ревизией и итогом «выполнена»', async () => {
    const { calls, port } = recording();

    await new ExampleGestures(port, () => {}).completeTask('side', 4);

    expect(calls).toHaveLength(1);
    const [name, region, action, input, revision, expected] = calls[0] ?? [];
    expect([name, region, action, input, revision]).toEqual([
      'submitInput',
      'side',
      'complete',
      undefined,
      4,
    ]);
    expect(typeof expected).toBe('function');
  });

  test('toggleTask: local main/toggle по uuid', async () => {
    const { calls, port } = recording();

    await new ExampleGestures(port, () => {}).toggleTask(ID);

    expect(calls).toEqual([['local', 'main', 'toggle', { taskId: ID }]]);
  });

  test('submitForm и runAction: submit с значениями формы; без полей — пустые значения', async () => {
    const { calls, port } = recording();
    const g = new ExampleGestures(port, () => {});

    await g.submitForm('main', 'create', { title: 'Хлеб' });
    await g.runAction('main', 'next', 2);

    expect(calls[0]?.slice(0, 4)).toEqual([
      'submit',
      'main',
      'create',
      { title: 'Хлеб' },
    ]);
    expect(calls[1]).toEqual(['submit', 'main', 'next', {}, 2]);
  });

  test('confirm, closeRegion, retry, openLink, follow', async () => {
    const { calls, port } = recording();
    const g = new ExampleGestures(port, () => {});
    const link: AddressJson = { screen: ASSIGNED_ID, params: {} };

    await g.confirm('main');
    g.closeRegion('modal');
    await g.retry('side');
    await g.openLink(link);
    await g.follow('/assigned');

    expect(calls).toEqual([
      ['confirm', 'main'],
      ['close', 'modal'],
      ['retry', 'side'],
      ['openLink', link],
      ['route', '/assigned'],
    ]);
  });
});

describe('ExampleGestures — бросок порта', () => {
  const SECRET = 'секрет Хлеб http://localhost/x?token=abc';

  /** Порт, у которого каждый вызов бросает (синхронно) или отклоняется. */
  const failing = (mode: 'throw' | 'reject'): GesturePort => {
    const boom = (): never => {
      throw new Error(SECRET);
    };
    const reject = () => Promise.reject(new Error(SECRET));
    const fail = mode === 'throw' ? boom : reject;
    return {
      submitInput: fail,
      submit: fail,
      local: fail,
      confirm: fail,
      close: mode === 'throw' ? boom : () => {},
      retry: fail,
      openLink: fail,
      route: fail,
    } as unknown as GesturePort;
  };

  for (const mode of ['throw', 'reject'] as const) {
    test(`порт ${mode === 'throw' ? 'бросает' : 'отклоняется'}: жест не бросает наружу, report — фиксированная строка без данных`, async () => {
      const { reports, report } = reporting();
      const g = new ExampleGestures(failing(mode), report);
      const id = testUuid(7);

      await g.openTask(id, 1);
      await g.completeTask('side', 1);
      await g.toggleTask(id);
      await g.submitForm('main', 'create', { title: 'Хлеб' });
      await g.runAction('main', 'next', 1);
      await g.confirm('main');
      await g.retry('side');
      await g.openLink({ screen: ASSIGNED_ID, params: {} });
      await g.follow('/assigned');
      if (mode === 'throw') g.closeRegion('side');

      expect(reports.length).toBeGreaterThanOrEqual(9);
      for (const text of reports) {
        expect(text).toBeTruthy();
        expect(text).not.toContain('Хлеб');
        expect(text).not.toContain('localhost');
        expect(text).not.toContain('секрет');
      }
    });
  }
});

describe('InboxModel.of — входящие', () => {
  test('назначение: текст «Вам назначена задача: Хлеб» и ссылка на «Назначенные мне»', async () => {
    const { w } = gatedWorld();
    const a = await annaWith(w, ['Хлеб']);
    const b = await openTab(w, TOKEN_BORIS, 'b');
    await cardOf(a, 'Хлеб');
    await a.client.submit('side', 'assign', {
      assigneeId: personOf('boris').uuid,
    });
    await settle(w, a, b);
    const entries = b.client.inbox().get();

    const items = InboxModel.of(entries, exampleWebViews);

    expect(items).toHaveLength(1);
    expect(items[0]?.text).toBe('Вам назначена задача: Хлеб');
    expect(items[0]?.links).toEqual([{ screen: ASSIGNED_ID, params: {} }]);
  });

  const entry = (over: Partial<PageInboxEntry>): PageInboxEntry => ({
    notification: 'exampleUi/todo/taskAssigned',
    data: { title: 'Хлеб' },
    links: [],
    ...over,
  });

  test('неизвестный id уведомления — «Уведомление не показано»', () => {
    const items = InboxModel.of(
      [entry({ notification: 'нет/такого' })],
      exampleWebViews,
    );

    expect(items.map((item) => item.text)).toEqual(['Уведомление не показано']);
  });

  test('данные не по схеме — «Уведомление не показано», бросок не уходит наружу', () => {
    const items = InboxModel.of(
      [entry({ data: { title: 5 } })],
      exampleWebViews,
    );

    expect(items.map((item) => item.text)).toEqual(['Уведомление не показано']);
  });

  test('новая запись — новый список; прежний не меняется', () => {
    const first = entry({});
    const second = entry({
      notification: 'exampleUi/todo/taskCompleted',
      data: { title: 'Молоко' },
    });

    const one = InboxModel.of([first], exampleWebViews);
    const two = InboxModel.of([first, second], exampleWebViews);

    expect(two).not.toBe(one);
    expect(one).toHaveLength(1);
    expect(two.map((item) => item.text)).toEqual([
      'Вам назначена задача: Хлеб',
      'Поручение выполнено: Молоко',
    ]);
  });
});
