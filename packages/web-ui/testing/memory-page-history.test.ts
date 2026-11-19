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

// Режим `deferred` описывает Chrome: `back()` возвращает промис сразу, а
// `popstate` приходит позже — по `release()`. Цель каждого перехода считается
// от цели прежнего неотпущенного; `push` до `release()` ложится во временный
// хвост, который первый же `release()` снимает; `replace` меняет ту запись,
// что текущая сейчас. Без неотпущенных переходов режим ведёт себя как
// `immediate` — его сцены выше.

/** Отложенная история с записями `/`, `/a`, `/b`, стоящая на последней. */
const threeDeferred = () => {
  const history = new MemoryPageHistory('/', null, 'deferred');
  history.push('/a', 'A');
  history.push('/b', 'B');
  return history;
};

/** Записи обработчика: что получил и сколько раз. */
const listening = (history: MemoryPageHistory) => {
  const seen: PageHistoryEntry[] = [];
  history.onTraverse((entry) => {
    seen.push(entry);
  });
  return seen;
};

/** Отдаёт микрозадачи без таймеров (TST-04). */
const turns = async () => {
  for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

const urlsOf = (history: MemoryPageHistory) =>
  history.entries().map((entry) => entry.url);

describe('MemoryPageHistory.deferred — «Назад» до popstate', () => {
  test('после back() текущая запись и положение прежние, обработчики не звались, pending = 1, промис уже разрешён', async () => {
    const history = threeDeferred();
    const seen = listening(history);
    let done = false;

    void history.back().then(() => {
      done = true;
    });
    await turns();

    expect(done).toBe(true);
    expect(history.current()).toEqual({ url: '/b', record: 'B' });
    expect(history.position).toBe(2);
    expect(seen).toEqual([]);
    expect(history.pending).toBe(1);
  });

  test('release() сдвигает положение, обработчик получает запись, release() ждёт его промис; pending = 0', async () => {
    const history = threeDeferred();
    const gate = Promise.withResolvers<void>();
    const seen: PageHistoryEntry[] = [];
    history.onTraverse((entry) => {
      seen.push(entry);
      return gate.promise;
    });
    void history.back();
    let done = false;

    const releasing = history.release().then(() => {
      done = true;
    });
    await turns();

    expect(seen).toEqual([{ url: '/a', record: 'A' }]);
    expect(done).toBe(false);
    gate.resolve();
    await releasing;
    expect(done).toBe(true);
    expect(history.position).toBe(1);
    expect(history.current()).toEqual({ url: '/a', record: 'A' });
    expect(history.pending).toBe(0);
  });

  test('два back() подряд — два перехода по очереди, цели накопительные', async () => {
    const history = threeDeferred();
    const seen = listening(history);

    void history.back();
    void history.back();
    expect(history.pending).toBe(2);
    expect(history.position).toBe(2);
    await history.release();
    expect(history.position).toBe(1);
    expect(history.pending).toBe(1);
    await history.release();

    expect(history.position).toBe(0);
    expect(history.pending).toBe(0);
    expect(seen.map((entry) => entry.url)).toEqual(['/a', '/']);
  });

  test('back() перед первой записью: popstate нет, leaves = 1, pending = 0', async () => {
    const history = new MemoryPageHistory('/', null, 'deferred');
    const seen = listening(history);

    await history.back();

    expect(history.leaves).toBe(1);
    expect(history.pending).toBe(0);
    expect(history.position).toBe(0);
    expect(seen).toEqual([]);
  });

  test('второй back() за первую запись при неотпущенном первом: переход один, leaves = 1', async () => {
    const history = new MemoryPageHistory('/', null, 'deferred');
    history.push('/a', 'A');

    void history.back();
    void history.back();

    expect(history.pending).toBe(1);
    expect(history.leaves).toBe(1);
    await history.release();
    expect(history.position).toBe(0);
  });

  test('forward() за последнюю запись — без действия: ни перехода, ни leaves', async () => {
    const history = threeDeferred();
    const seen = listening(history);

    await history.forward();

    expect(history.pending).toBe(0);
    expect(history.leaves).toBe(0);
    expect(history.position).toBe(2);
    expect(seen).toEqual([]);
  });

  test('forward() после back() идёт от цели неотпущенного: две записи — на последнюю', async () => {
    const history = threeDeferred();
    const seen = listening(history);
    void history.back();
    void history.back();

    void history.forward();
    expect(history.pending).toBe(3);
    await history.release();
    await history.release();
    await history.release();

    expect(seen.map((entry) => entry.url)).toEqual(['/a', '/', '/a']);
    expect(history.position).toBe(1);
  });
});

describe('MemoryPageHistory.deferred — push и replace до popstate', () => {
  test('push при неотпущенном: current() и pushes видят запись; после release() её нет, «вперёд» ведёт к прежней', async () => {
    const history = threeDeferred();
    const seen = listening(history);
    void history.back();

    history.push('/c', 'C');

    expect(history.current()).toEqual({ url: '/c', record: 'C' });
    expect(history.pushes).toBe(3);
    await history.release();
    expect(history.current()).toEqual({ url: '/a', record: 'A' });
    expect(urlsOf(history)).toEqual(['/', '/a', '/b']);
    void history.forward();
    await history.release();
    expect(history.current()).toEqual({ url: '/b', record: 'B' });
    expect(seen.map((entry) => entry.url)).toEqual(['/a', '/b']);
  });

  test('replace при неотпущенном меняет запись, бывшую текущей, и переживает release()', async () => {
    const history = threeDeferred();
    void history.back();

    history.replace('/b2', 'B2');

    expect(history.current()).toEqual({ url: '/b2', record: 'B2' });
    expect(history.replaces).toBe(1);
    await history.release();
    expect(history.current()).toEqual({ url: '/a', record: 'A' });
    expect(urlsOf(history)).toEqual(['/', '/a', '/b2']);
    void history.forward();
    await history.release();
    expect(history.current()).toEqual({ url: '/b2', record: 'B2' });
  });

  test('replace хвостовой записи: current() видит замену, release() снимает хвост вместе с ней', async () => {
    const history = threeDeferred();
    void history.back();
    history.push('/c', 'C');

    history.replace('/c2', 'C2');

    expect(history.current()).toEqual({ url: '/c2', record: 'C2' });
    await history.release();
    expect(urlsOf(history)).toEqual(['/', '/a', '/b']);
    expect(history.entries()[2]).toEqual({ url: '/b', record: 'B' });
  });

  test('release() без неотпущенного перехода — бросок с названием подставы', async () => {
    const history = threeDeferred();

    await expect(
      Promise.resolve().then(() => history.release()),
    ).rejects.toThrow('MemoryPageHistory');
  });
});

describe('MemoryPageHistory.deferred — перезагрузка и порт', () => {
  test('reloaded() сохраняет режим, неотпущенные переходы и хвост отбрасывает', async () => {
    const history = threeDeferred();
    void history.back();
    history.push('/c', 'C');

    const reloaded = history.reloaded();

    expect(reloaded.pending).toBe(0);
    expect(reloaded.leaves).toBe(0);
    expect(urlsOf(reloaded)).toEqual(['/', '/a', '/b']);
    expect(reloaded.position).toBe(2);
    expect(reloaded.current()).toEqual({ url: '/b', record: 'B' });
    void reloaded.back();
    expect(reloaded.pending).toBe(1);
    expect(reloaded.position).toBe(2);
  });

  test('через тип порта back() разрешается до перехода: обработчик не звался, запись прежняя', async () => {
    const history = threeDeferred();
    const port: PageHistoryPort = history;
    const seen = listening(history);
    let done = false;

    void Promise.resolve(port.back()).then(() => {
      done = true;
    });
    await turns();

    expect(done).toBe(true);
    expect(seen).toEqual([]);
    expect(port.current()).toEqual({ url: '/b', record: 'B' });
    await history.release();
    expect(seen).toEqual([{ url: '/a', record: 'A' }]);
  });
});
