import type { PageClock } from './page-clock.types';

/**
 * Часы вкладки поверх среды: время — `Date.now`, отложенный вызов — таймер
 * среды. Единицы — мс; `after(0, …)` исполняется позже, не при постановке.
 * Единственное место пакета с таймером среды: остальной код берёт порт
 * `PageClock`.
 */
export class PageSystemClock implements PageClock {
  now(): number {
    return Date.now();
  }

  after(ms: number, run: () => void): () => void {
    const timer = setTimeout(run, ms);
    return () => {
      clearTimeout(timer);
    };
  }
}
