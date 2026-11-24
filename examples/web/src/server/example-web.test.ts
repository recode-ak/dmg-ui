import { describe, expect, test } from 'bun:test';
import { MemoryLogger, useTempDir } from 'dmg-core/testing';
import { exampleCodes, MemoryUiObserver } from 'dmg-ui/testing';
import { PageClient, PageWire, type ViewSource } from 'dmg-ui/web-ui';
import {
  ExamplePagesUiAppDef,
  examplePagesRoutes,
  exampleSubjectWire,
} from 'dmg-ui/web-ui/testing';
import * as v from 'valibot';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import { ExampleWeb } from './example-web';

// Сборка примера без сети: приложение, сервер UI, хост канала и уведомитель.
// Провод — в памяти (`PageWire`): два человека — два мира, уведомитель
// подписан, `close()` отписывает и безопасен повторно.

const tmp = useTempDir('example-web-assembly-');

const person = (key: string) => {
  const found = EXAMPLE_PEOPLE.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`нет человека ${key}`);
  return found;
};

const TOKENS = new Map([
  ['tA', person('anna').uuid],
  ['tB', person('boris').uuid],
]);

const assemble = () =>
  ExampleWeb.assemble({
    dataDir: tmp().path,
    tokens: async (token: string) => TOKENS.get(token),
    logger: new MemoryLogger(),
    delayMs: 0,
  });

/** Вкладка человека на проводе в памяти. */
const tab = async (
  web: Awaited<ReturnType<typeof assemble>>,
  token: string,
) => {
  const wire = new PageWire(web.host);
  const connected = await wire.connect(token);
  if (!connected.ok) throw new Error(`connect(${token}): отказ`);
  const client = new PageClient({
    app: ExamplePagesUiAppDef,
    codes: exampleCodes({}, ExamplePagesUiAppDef),
    routes: examplePagesRoutes,
    end: connected.value,
    observer: new MemoryUiObserver(),
    reviveSubject: exampleSubjectWire.revive,
  });
  return { wire, client };
};

const until = <T>(source: ViewSource<T>, predicate: (value: T) => boolean) =>
  new Promise<T>((resolve) => {
    let done = false;
    let off: () => void = () => {};
    off = source.subscribe((value) => {
      if (done || !predicate(value)) return;
      done = true;
      resolve(value);
      off();
    });
    if (done) off();
  });

const Tasks = v.object({ tasks: v.array(v.object({ title: v.string() })) });

describe('ExampleWeb.assemble', () => {
  test('два человека — два мира: задача Анны не видна Борису', async () => {
    const web = await assemble();
    const a = await tab(web, 'tA');
    const b = await tab(web, 'tB');
    await a.client.route('/');
    await b.client.route('/');

    await a.client.submit('main', 'create', { title: 'Хлеб' });
    await a.wire.settled();

    const mine = v.parse(Tasks, a.client.region('main').view?.data).tasks;
    const theirs = v.parse(Tasks, b.client.region('main').view?.data).tasks;
    expect(mine.map((task) => task.title)).toEqual(['Хлеб']);
    expect(theirs).toEqual([]);
    await web.close();
  });

  test('уведомитель подписан: назначение Анны приходит Борису во входящие', async () => {
    const web = await assemble();
    const a = await tab(web, 'tA');
    const b = await tab(web, 'tB');
    await a.client.route('/');
    await a.client.submit('main', 'create', { title: 'Хлеб' });
    await a.client.submit('main', 'open', { taskId: 'Хлеб' });

    await a.client.submit('side', 'assign', {
      assigneeId: person('boris').uuid,
    });
    const entries = await until(b.client.inbox(), (list) => list.length >= 1);

    expect(entries[0]?.notification).toBe('exampleUi/todo/taskAssigned');
    expect(entries[0]?.data).toEqual({ title: 'Хлеб' });
    await web.close();
  });

  test('неизвестный пропуск — отказ соединения', async () => {
    const web = await assemble();

    const res = await new PageWire(web.host).connect('нет такого');

    expect(res.ok).toBe(false);
    await web.close();
  });

  test('close безопасен повторно', async () => {
    const web = await assemble();

    await web.close();

    await expect(web.close()).resolves.toBeUndefined();
  });

  test('close сразу после сборки, без соединений, не бросает', async () => {
    const web = await assemble();

    await expect(web.close()).resolves.toBeUndefined();
  });
});
