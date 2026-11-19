import { describe, expect, test } from 'bun:test';
import { PageBrowserHistory } from './page-browser-history';
import type { PageBrowserWindow, PageHistoryEntry } from './page-history.types';

// Привязка порта истории к браузеру — тест без браузера: подставной объект
// узкого типа `PageBrowserWindow` помнит вызовы `pushState`/`replaceState`,
// держит путь, строку запроса и запись истории и по команде теста шлёт
// `popstate`. Хэша у `location` в типе нет — URL записи без фрагмента.

/** Подставная история браузера: запись текущей записи и журнал вызовов. */
class StubBrowserHistory {
  state: unknown = null;
  readonly calls: [string, unknown, string, string][] = [];
  refusal: Error | undefined;
  /** Сколько раз позван `back()`. */
  backs = 0;

  back(): void {
    this.backs += 1;
  }

  pushState(data: unknown, unused: string, url: string): void {
    this.write('pushState', data, unused, url);
  }

  replaceState(data: unknown, unused: string, url: string): void {
    this.write('replaceState', data, unused, url);
  }

  private write(
    method: string,
    data: unknown,
    unused: string,
    url: string,
  ): void {
    if (this.refusal !== undefined) throw this.refusal;
    this.calls.push([method, data, unused, url]);
  }
}

/** Подставное окно: история, адрес (с хэшем, которого узкий тип не видит) и `popstate`. */
class StubWindow implements PageBrowserWindow {
  readonly history = new StubBrowserHistory();
  readonly location = { pathname: '/', search: '', hash: '' };
  readonly listeners: (() => void)[] = [];
  readonly types: string[] = [];

  addEventListener(type: 'popstate', listener: () => void): void {
    this.types.push(type);
    this.listeners.push(listener);
  }

  /** Запись, на которой вкладка: адрес и запись истории. */
  set(pathname: string, search: string, hash: string, state: unknown): void {
    this.location.pathname = pathname;
    this.location.search = search;
    this.location.hash = hash;
    this.history.state = state;
  }

  /** Браузер перешёл на запись: адрес и запись сменились, затем `popstate`. */
  traverse(pathname: string, search: string, state: unknown): void {
    this.set(pathname, search, '', state);
    for (const listener of this.listeners) listener();
  }
}

describe('PageBrowserHistory', () => {
  test('current() — путь и строка запроса, запись истории как есть', () => {
    const browser = new StubWindow();
    const state = { version: 1 };
    browser.set('/todo/taskCard', '?taskId=1', '', state);

    const entry = new PageBrowserHistory(browser).current();

    expect(entry.url).toBe('/todo/taskCard?taskId=1');
    expect(entry.record).toBe(state);
  });

  test('current() — хэш в URL записи не попадает', () => {
    const browser = new StubWindow();
    browser.set('/', '?page=1', '#top', 'запись');

    expect(new PageBrowserHistory(browser).current()).toEqual({
      url: '/?page=1',
      record: 'запись',
    });
  });

  test('current() у начальной записи — запись null, URL — путь', () => {
    const browser = new StubWindow();

    expect(new PageBrowserHistory(browser).current()).toEqual({
      url: '/',
      record: null,
    });
  });

  test('push — pushState(запись, пустая строка, URL)', () => {
    const browser = new StubWindow();

    new PageBrowserHistory(browser).push('/?page=1', '{"version":1}');

    expect(browser.history.calls).toEqual([
      ['pushState', '{"version":1}', '', '/?page=1'],
    ]);
  });

  test('replace — replaceState(запись, пустая строка, URL)', () => {
    const browser = new StubWindow();

    new PageBrowserHistory(browser).replace('/assigned', '{"version":1}');

    expect(browser.history.calls).toEqual([
      ['replaceState', '{"version":1}', '', '/assigned'],
    ]);
  });

  test('popstate — обработчик получает запись, на которой вкладка на момент события', () => {
    const browser = new StubWindow();
    const history = new PageBrowserHistory(browser);
    const seen: PageHistoryEntry[] = [];
    history.onTraverse((entry) => {
      seen.push(entry);
    });

    browser.traverse('/assigned', '', 'первая');
    browser.traverse('/', '?page=2', 'вторая');

    expect(seen).toEqual([
      { url: '/assigned', record: 'первая' },
      { url: '/?page=2', record: 'вторая' },
    ]);
    expect(browser.types).toEqual(['popstate']);
  });

  test('back — history.back() окна один раз; записей не пишет', () => {
    const browser = new StubWindow();

    new PageBrowserHistory(browser).back();

    expect(browser.history.backs).toBe(1);
    expect(browser.history.calls).toEqual([]);
  });

  test('back не ждёт popstate: вызов разрешается до события, обработчик им не зовётся', async () => {
    const browser = new StubWindow();
    const history = new PageBrowserHistory(browser);
    const seen: PageHistoryEntry[] = [];
    history.onTraverse((entry) => {
      seen.push(entry);
    });
    let settled = false;

    void Promise.resolve(history.back()).then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(true);
    expect(seen).toEqual([]);
  });

  test('popstate после back — обработчик получает запись, на которой вкладка теперь', () => {
    const browser = new StubWindow();
    const history = new PageBrowserHistory(browser);
    const seen: PageHistoryEntry[] = [];
    history.onTraverse((entry) => {
      seen.push(entry);
    });

    history.back();
    browser.traverse('/', '', 'предыдущая');

    expect(seen).toEqual([{ url: '/', record: 'предыдущая' }]);
  });

  test('бросок pushState и replaceState уходит вызывающему', () => {
    const browser = new StubWindow();
    const history = new PageBrowserHistory(browser);
    browser.history.refusal = new Error('SecurityError');

    expect(() => history.push('/', '{}')).toThrow('SecurityError');
    expect(() => history.replace('/', '{}')).toThrow('SecurityError');
  });
});
