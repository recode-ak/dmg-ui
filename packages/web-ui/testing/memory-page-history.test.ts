import { describe, expect, test } from 'bun:test';
import type { PageHistoryEntry, PageHistoryPort } from 'dmg-ui/web-ui';
import { MemoryPageHistory } from './index';

// Подставная история вкладки для тестов без браузера: записи и положение в
// памяти, `push` обрезает «вперёд», `back`/`forward` зовут обработчики и ждут
// их промисов (без таймеров). `reloaded()` — те же записи глазами новой
// страницы после перезагрузки; `fail` — отказ браузера записывать.

/** История с записями `/`, `/a`, `/b`, стоящая на последней. */
const three = () => {
  const history = new MemoryPageHistory('/', null);
  history.push('/a', 'A');
  history.push('/b', 'B');
  return history;
};

describe('MemoryPageHistory — записи', () => {
  test('начальная запись — как у браузера до работы скрипта: по умолчанию `/` без записи', () => {
    expect(new MemoryPageHistory().current()).toEqual({
      url: '/',
      record: null,
    });
    expect(new MemoryPageHistory('/?page=1', 'R').current()).toEqual({
      url: '/?page=1',
      record: 'R',
    });
  });

  test('push добавляет запись и встаёт на неё; счётчики push и replace', () => {
    const history = new MemoryPageHistory('/');

    history.push('/a', 'A');
    history.replace('/a?x=1', 'A2');

    expect(history.entries()).toEqual([
      { url: '/', record: null },
      { url: '/a?x=1', record: 'A2' },
    ]);
    expect(history.position).toBe(1);
    expect(history.current()).toEqual({ url: '/a?x=1', record: 'A2' });
    expect(history.pushes).toBe(1);
    expect(history.replaces).toBe(1);
  });

  test('push после «Назад» обрезает «Вперёд»', async () => {
    const history = three();
    await history.back();
    await history.back();

    history.push('/c', 'C');

    expect(history.entries().map((entry) => entry.url)).toEqual(['/', '/c']);
    expect(history.position).toBe(1);
  });

  test('entries() — копия: дальнейшие записи её не меняют', () => {
    const history = new MemoryPageHistory('/');
    const entries = history.entries();

    history.push('/a', 'x');

    expect(entries).toHaveLength(1);
  });

  test('replace меняет только текущую запись', async () => {
    const history = three();
    await history.back();

    history.replace('/a2', 'A2');

    expect(history.entries()).toEqual([
      { url: '/', record: null },
      { url: '/a2', record: 'A2' },
      { url: '/b', record: 'B' },
    ]);
  });

  test.each(['//x', '/\\x', '//evil.com/a', 'x', '', 'http://x/'])(
    'URL %p не свой — push и replace бросают, записи не тронуты',
    (url) => {
      const history = new MemoryPageHistory('/');

      expect(() => history.push(url, 'R')).toThrow();
      expect(() => history.replace(url, 'R')).toThrow();
      expect(history.entries()).toEqual([{ url: '/', record: null }]);
      expect(history.pushes).toBe(0);
      expect(history.replaces).toBe(0);
    },
  );
});

describe('MemoryPageHistory — «Назад» и «Вперёд»', () => {
  test('обработчик получает запись, на которой история теперь', async () => {
    const history = three();
    const seen: PageHistoryEntry[] = [];
    history.onTraverse((entry) => {
      seen.push(entry);
    });

    await history.back();
    await history.back();
    await history.forward();

    expect(seen).toEqual([
      { url: '/a', record: 'A' },
      { url: '/', record: null },
      { url: '/a', record: 'A' },
    ]);
    expect(history.position).toBe(1);
  });

  test('на краю — без действия и без вызова обработчиков', async () => {
    const history = three();
    let calls = 0;
    history.onTraverse(() => {
      calls += 1;
    });

    await history.forward();
    expect(history.position).toBe(2);
    await history.back();
    await history.back();
    await history.back();

    expect(history.position).toBe(0);
    expect(calls).toBe(2);
  });

  test('промис back() ждёт промиса обработчика', async () => {
    const history = three();
    const gate = Promise.withResolvers<void>();
    let done = false;
    history.onTraverse(() => gate.promise);

    const going = history.back().then(() => {
      done = true;
    });
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    expect(done).toBe(false);
    gate.resolve();
    await going;

    expect(done).toBe(true);
  });

  test('положение сдвигается сразу, до конца обработчика', () => {
    const history = three();
    history.onTraverse(() => new Promise<void>(() => undefined));

    void history.back();

    expect(history.position).toBe(1);
    expect(history.current().url).toBe('/a');
  });

  test('отказ обработчика — промис back() отклонён', async () => {
    const history = three();
    history.onTraverse(() => Promise.reject(new Error('код не загрузился')));

    await expect(history.back()).rejects.toThrow('код не загрузился');
  });
});

describe('MemoryPageHistory как PageHistoryPort', () => {
  test('back() — член порта: через тип порта зовёт обработчики и ждёт их промисов', async () => {
    const port: PageHistoryPort = three();
    const seen: PageHistoryEntry[] = [];
    const gate = Promise.withResolvers<void>();
    port.onTraverse((entry) => {
      seen.push(entry);
      return gate.promise;
    });
    let done = false;

    const going = Promise.resolve(port.back()).then(() => {
      done = true;
    });
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    expect(done).toBe(false);
    gate.resolve();
    await going;

    expect(done).toBe(true);
    expect(seen).toEqual([{ url: '/a', record: 'A' }]);
  });

  test('back() через порт сдвигает положение сразу, как и запись «Назад»', () => {
    const history = three();
    const port: PageHistoryPort = history;

    void port.back();

    expect(history.position).toBe(1);
    expect(port.current().url).toBe('/a');
  });
});

describe('MemoryPageHistory.settled — ожидание перехода', () => {
  test('ждёт обработчиков последнего перехода, начатого без ожидания', async () => {
    const history = three();
    const gate = Promise.withResolvers<void>();
    history.onTraverse(() => gate.promise);
    let done = false;

    void history.back();
    const waiting = history.settled().then(() => {
      done = true;
    });
    for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
    expect(done).toBe(false);
    gate.resolve();
    await waiting;

    expect(done).toBe(true);
  });

  test('переходов не было — разрешён сразу', async () => {
    await expect(three().settled()).resolves.toBeUndefined();
  });
});

describe('MemoryPageHistory.reloaded — перезагрузка вкладки', () => {
  test('те же записи и положение; обработчиков прежней страницы нет; счётчики с нуля', async () => {
    const history = three();
    await history.back();
    let calls = 0;
    history.onTraverse(() => {
      calls += 1;
    });

    const reloaded = history.reloaded();

    expect(reloaded.entries()).toEqual(history.entries());
    expect(reloaded.position).toBe(1);
    expect(reloaded.current()).toEqual({ url: '/a', record: 'A' });
    expect(reloaded.pushes).toBe(0);
    expect(reloaded.replaces).toBe(0);
    await reloaded.back();
    expect(calls).toBe(0);
  });

  test('записи новой страницы от прежней не зависят', () => {
    const history = three();
    const reloaded = history.reloaded();

    reloaded.replace('/b2', 'B2');

    expect(history.current()).toEqual({ url: '/b', record: 'B' });
  });
});

describe('MemoryPageHistory.fail — отказ браузера', () => {
  test('push и replace бросают тем же броском до fail(undefined); записи не тронуты', () => {
    const history = new MemoryPageHistory('/');
    const refusal = new Error('SecurityError');

    history.fail(refusal);

    expect(() => history.push('/a', 'A')).toThrow(refusal);
    expect(() => history.replace('/a', 'A')).toThrow(refusal);
    expect(history.entries()).toEqual([{ url: '/', record: null }]);
    history.fail(undefined);
    history.push('/a', 'A');
    expect(history.entries()).toHaveLength(2);
  });

  test('отказ не мешает «Назад»: переход по записям браузер не запрещает', async () => {
    const history = three();
    history.fail(new Error('SecurityError'));

    await history.back();

    expect(history.current().url).toBe('/a');
  });
});
