import { describe, expect, test } from 'bun:test';
import { Caller, type SerializedResult } from 'dmg-core';
import { testTrace } from 'dmg-core/testing';
import {
  CompleteTaskUcDef,
  type ExampleUser,
  ListTasksUcDef,
  TodoModuleDef,
} from 'dmg-core/testing/example';
import type { UcDispatch, UcRequest } from 'dmg-ui/server';
import { flush } from '../testing/example-world';
import { DelayedDispatch } from './delayed-dispatch';

// «Медленный сервер»: один вызов команды за раз ждёт `delayMs` до исполнения;
// пока он ждёт, остальные вызовы (команды и запросы) идут сразу. Ожидание —
// порт `wait`: тест держит его промисы и отпускает сам, таймеров нет.

const DELAY = 6000;

/** Вызов UC: тип берётся у Def (`command` или `query`). */
const request = (kind: 'command' | 'query'): UcRequest<ExampleUser> => ({
  module: TodoModuleDef,
  uc: kind === 'command' ? CompleteTaskUcDef : ListTasksUcDef,
  input: {},
  caller: Caller.fromJSON({ kind: 'guest' }),
  trace: testTrace(),
});

/** Внутренний бэкенд: записывает вызовы, отвечает заданным результатом или отказом. */
class InnerDispatch implements UcDispatch<ExampleUser> {
  readonly calls: string[] = [];

  constructor(
    private readonly answer: SerializedResult = { ok: true, value: 'готово' },
    private readonly failure?: Error,
  ) {}

  async dispatch(req: UcRequest<ExampleUser>): Promise<SerializedResult> {
    this.calls.push(req.uc.type);
    if (this.failure !== undefined) throw this.failure;
    return this.answer;
  }
}

/** Порт `wait` с удержанием: каждый вызов — отдельный промис, отпускается `release(n)`. */
const waiting = () => {
  const delays: number[] = [];
  const gates: PromiseWithResolvers<void>[] = [];
  return {
    delays,
    wait: (ms: number) => {
      delays.push(ms);
      const gate = Promise.withResolvers<void>();
      gates.push(gate);
      return gate.promise;
    },
    release: (n: number) => gates[n]?.resolve(),
  };
};

const setup = (inner = new InnerDispatch(), delayMs = DELAY) => {
  const port = waiting();
  const dispatch = new DelayedDispatch({ inner, delayMs, wait: port.wait });
  return { inner, port, dispatch };
};

describe('DelayedDispatch — команда', () => {
  test('ждёт delayMs до исполнения: внутренний вызов — только после отпускания', async () => {
    const { inner, port, dispatch } = setup();

    const pending = dispatch.dispatch(request('command'));
    await flush();

    expect(port.delays).toEqual([DELAY]);
    expect(inner.calls).toEqual([]);
    port.release(0);
    await pending;
    expect(inner.calls).toEqual(['command']);
  });

  test('исход внутреннего вызова — без изменений', async () => {
    const answer: SerializedResult = { ok: true, value: { taskId: 'x' } };
    const { port, dispatch } = setup(new InnerDispatch(answer));

    const pending = dispatch.dispatch(request('command'));
    await flush();
    port.release(0);

    expect(await pending).toBe(answer);
  });

  test('отказ внутреннего вызова пробрасывается', async () => {
    const failure = new Error('сбой внутри');
    const { port, dispatch } = setup(new InnerDispatch(undefined, failure));

    const pending = dispatch.dispatch(request('command'));
    await flush();
    port.release(0);

    await expect(pending).rejects.toBe(failure);
  });

  test('второй command, пока первый ждёт, идёт сразу и без ожидания', async () => {
    const { inner, port, dispatch } = setup();

    const first = dispatch.dispatch(request('command'));
    await flush();
    const second = await dispatch.dispatch(request('command'));

    expect(second).toMatchObject({ ok: true });
    expect(port.delays).toEqual([DELAY]);
    expect(inner.calls).toEqual(['command']);
    port.release(0);
    await first;
    expect(inner.calls).toEqual(['command', 'command']);
  });

  test('после завершения первого следующий command снова ждёт', async () => {
    const { port, dispatch } = setup();
    const first = dispatch.dispatch(request('command'));
    await flush();
    port.release(0);
    await first;

    const next = dispatch.dispatch(request('command'));
    await flush();

    expect(port.delays).toEqual([DELAY, DELAY]);
    port.release(1);
    await next;
  });

  test('после отказа внутреннего вызова место ожидания освобождено: следующий command снова ждёт', async () => {
    const { port, dispatch } = setup(
      new InnerDispatch(undefined, new Error('сбой')),
    );
    const first = dispatch.dispatch(request('command'));
    await flush();
    port.release(0);
    await first.catch(() => {});

    const next = dispatch.dispatch(request('command'));
    await flush();

    expect(port.delays).toEqual([DELAY, DELAY]);
    port.release(1);
    await next.catch(() => {});
  });
});

describe('DelayedDispatch — запрос и нулевая задержка', () => {
  test('query не ждёт: wait не зовётся', async () => {
    const { inner, port, dispatch } = setup();

    await dispatch.dispatch(request('query'));

    expect(port.delays).toEqual([]);
    expect(inner.calls).toEqual(['query']);
  });

  test('query, пока command ждёт, идёт сразу и ожидающую команду не трогает', async () => {
    const { inner, port, dispatch } = setup();
    const command = dispatch.dispatch(request('command'));
    await flush();

    await dispatch.dispatch(request('query'));

    expect(inner.calls).toEqual(['query']);
    port.release(0);
    await command;
    expect(inner.calls).toEqual(['query', 'command']);
  });

  test('delayMs 0: wait не зовётся даже для command', async () => {
    const { inner, port, dispatch } = setup(new InnerDispatch(), 0);

    await dispatch.dispatch(request('command'));

    expect(port.delays).toEqual([]);
    expect(inner.calls).toEqual(['command']);
  });
});
