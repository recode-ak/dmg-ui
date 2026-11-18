import { describe, expect, test } from 'bun:test';
import { PageSystemClock } from './page-system-clock';

// Часы вкладки поверх среды — тест привязки: время среды и отложенный вызов
// таймером среды. Тест сам пауз не ставит: ожидание — промисом, который
// разрешает вызов `after(0, …)`.

describe('PageSystemClock', () => {
  test('now() — число мс; второй вызов не меньше первого', () => {
    const clock = new PageSystemClock();

    const first = clock.now();
    const second = clock.now();

    expect(Number.isFinite(first)).toBe(true);
    expect(second).toBeGreaterThanOrEqual(first);
  });

  test('after(0, run) — run исполнен позже, не синхронно при постановке', async () => {
    const clock = new PageSystemClock();
    let ran = false;

    const done = new Promise<void>((resolve) => {
      clock.after(0, () => {
        ran = true;
        resolve();
      });
    });
    const synchronously = ran;
    await done;

    expect(synchronously).toBe(false);
    expect(ran).toBe(true);
  });

  test('отменённый вызов, поставленный раньше, к исполнению следующего не исполнен', async () => {
    const clock = new PageSystemClock();
    let cancelledRan = false;

    const cancel = clock.after(0, () => {
      cancelledRan = true;
    });
    cancel();
    await new Promise<void>((resolve) => {
      clock.after(0, resolve);
    });

    expect(cancelledRan).toBe(false);
  });
});
