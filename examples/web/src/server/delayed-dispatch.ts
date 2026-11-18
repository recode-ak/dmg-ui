import type { Identified, SerializedResult } from 'dmg-core';
import type { UcDispatch, UcRequest } from 'dmg-ui/server';
import type { DelayedDispatchSpec } from './delayed-dispatch.types';

/**
 * «Медленный сервер»: вызов команды ждёт `delayMs` до исполнения, если сейчас
 * нет другого задержанного вызова; пока один ждёт, остальные (команды и
 * запросы) идут сразу. Так вторая вкладка того же человека успевает выполнить
 * то же действие раньше задержанного, и у первой видно, как показ до ответа
 * откатывается по отказу. `close()` не ждёт задержанный вызов: он не
 * исполняется (остановка сервера до ответа — обрыв, а не «выполнено»).
 */
export class DelayedDispatch<U extends Identified> implements UcDispatch<U> {
  private readonly wait: (ms: number) => Promise<void>;
  private waiting = false;
  private closed = false;
  private readonly closing = Promise.withResolvers<void>();

  constructor(private readonly spec: DelayedDispatchSpec<U>) {
    this.wait = spec.wait ?? DelayedDispatch.sleep;
  }

  async dispatch(request: UcRequest<U>): Promise<SerializedResult> {
    if (request.uc.type !== 'command' || this.waiting) {
      return this.spec.inner.dispatch(request);
    }
    if (this.spec.delayMs <= 0) return this.spec.inner.dispatch(request);
    this.waiting = true;
    try {
      await Promise.race([this.wait(this.spec.delayMs), this.closing.promise]);
    } finally {
      this.waiting = false;
    }
    // Остановка: вызов не исполняется и не завершается — сокеты уже закрыты.
    if (this.closed) return new Promise<never>(() => {});
    return this.spec.inner.dispatch(request);
  }

  /** Освобождает ждущий вызов без исполнения; повторный вызов — без действия. */
  close(): void {
    this.closed = true;
    this.closing.resolve();
  }

  /** Настоящее ожидание; таймер не держит процесс после остановки сервера. */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms).unref();
    });
  }
}
