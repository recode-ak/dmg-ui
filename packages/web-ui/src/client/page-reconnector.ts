import { err, type Result } from 'dmg-core';
import type { ClientEnd } from '../wire/page-wire.types';
import { RECONNECT } from './page-reconnector.const';
import type { PageReconnectorSpec } from './page-reconnector.types';
import type { PageDialFailure, PageSocket } from './page-socket.types';
import { PageSocketEnd } from './page-socket-end';

/**
 * Переподключение вкладки (D-UI-74): попытки соединения с паузой и разбросом,
 * срок ожидания `hello`, после отказа `refused` — сразу верхняя ступень паузы
 * (неизвестный пропуск или предел соединений в цикле не повторяются). Счёт
 * пауз сбрасывает только обрыв соединения, прожившего от `hello` не меньше
 * `RECONNECT.stableMs`. Время — только порт `clock`.
 * @see ./page-reconnector.test.ts
 */
export class PageReconnector {
  private readonly spec: PageReconnectorSpec;
  private readonly random: () => number;
  private closed = false;
  /** Конец, за обрывом которого следит переподключатель. */
  private current: ClientEnd | undefined;
  /** Отмена ждущей паузы или идущей попытки — для `close()`. */
  private stop: (() => void) | undefined;
  /** Сбои подряд — номер ступени паузы; переживает короткие соединения. */
  private failures = 0;
  /** Время `hello` концов своих попыток — для правила `stableMs`. */
  private readonly opened = new WeakMap<ClientEnd, number>();

  constructor(spec: PageReconnectorSpec) {
    this.spec = spec;
    this.random = spec.random ?? Math.random;
  }

  /** Первая попытка — сразу, дальше с паузой до `hello`; после `close()` — отказ. */
  async connect(): Promise<ClientEnd> {
    const end = await this.dial(undefined);
    if (end === undefined) {
      throw new Error('PageReconnector: переподключатель закрыт');
    }
    this.current = end;
    return end;
  }

  /**
   * Следить за обрывом `end`; прежний конец больше не следится. После обрыва
   * — попытки с паузой; новый конец сначала под слежение, затем синхронно в
   * `attach` — раньше своих кадров. Свой конец (смена личности) — сначала
   * `follow(next, attach)`, затем `client.attach(next)`: иначе закрытие
   * прежнего даст попытку, и она подменит конец.
   */
  follow(
    end: ClientEnd,
    attach: (next: ClientEnd) => Promise<void> | void,
  ): void {
    this.current = end;
    const since = this.opened.get(end) ?? this.spec.clock.now();
    end.onBreak(() => {
      if (this.closed || this.current !== end) return;
      if (this.spec.clock.now() - since >= RECONNECT.stableMs) {
        this.failures = 0;
      }
      this.recover(attach).catch((error: unknown) => this.fault(error));
    });
  }

  /** Отмена ждущей паузы и идущей попытки; текущий конец закрыт; попыток больше нет. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    const stop = this.stop;
    this.stop = undefined;
    stop?.();
    const end = this.current;
    this.current = undefined;
    end?.close();
  }

  /**
   * Новый конец — под слежение, затем `attach`; бросок и отказ `attach` ловит
   * `follow` в `faults`: слежение за новым концом уже стоит, попытки идут.
   */
  private async recover(
    attach: (next: ClientEnd) => Promise<void> | void,
  ): Promise<void> {
    const next = await this.dial('closed');
    if (next === undefined) return;
    this.follow(next, attach);
    await attach(next);
  }

  /**
   * Попытки до `hello`; `first` — сбой, после которого начинают (с паузы),
   * нет — первая сразу. `undefined` — переподключатель закрыт.
   */
  private async dial(
    first: PageDialFailure | undefined,
  ): Promise<ClientEnd | undefined> {
    let failure = first;
    for (;;) {
      if (failure !== undefined) {
        this.failures += 1;
        const ms = this.pause(this.failures, failure);
        if (!(await this.wait(ms))) return undefined;
      }
      if (this.closed) return undefined;
      const result = await this.attempt();
      if (this.closed) {
        if (result.ok) result.value.close();
        return undefined;
      }
      if (result.ok) {
        this.opened.set(result.value, this.spec.clock.now());
        return result.value;
      }
      failure = result.error;
    }
  }

  /**
   * Одна попытка: новый сокет и `hello` в гонке со сроком. Срок вышел — сокет
   * закрыт, итог `timeout`; опоздавший конец закрывается. Бросок фабрики
   * сокета или подписки на него — в `faults` и как закрытие.
   */
  private attempt(): Promise<Result<ClientEnd, PageDialFailure>> {
    let socket: PageSocket;
    let connecting: Promise<Result<ClientEnd, PageDialFailure>>;
    try {
      socket = this.spec.sockets();
    } catch (error) {
      this.fault(error);
      return Promise.resolve(err('closed'));
    }
    try {
      connecting = PageSocketEnd.connect(socket);
    } catch (error) {
      this.fault(error);
      socket.close();
      return Promise.resolve(err('closed'));
    }
    return new Promise((resolve) => {
      let done = false;
      let cancel = () => {};
      const finish = (result: Result<ClientEnd, PageDialFailure>): boolean => {
        if (done) return false;
        done = true;
        cancel();
        this.stop = undefined;
        resolve(result);
        return true;
      };
      cancel = this.spec.clock.after(RECONNECT.helloMs, () => {
        if (finish(err('timeout'))) socket.close();
      });
      this.stop = () => {
        if (finish(err('closed'))) socket.close();
      };
      void connecting.then((result) => {
        if (!finish(result) && result.ok) result.value.close();
      });
    });
  }

  /** Бросок в порт диагностики; бросок самого порта гасится — сообщить некуда. */
  private fault(error: unknown): void {
    try {
      this.spec.faults?.(error);
    } catch {
      // Диагностика не останавливает переподключение.
    }
  }

  /** Пауза `ms` по часам: `true` — истекла, `false` — отменена `close()`. */
  private wait(ms: number): Promise<boolean> {
    return new Promise((resolve) => {
      const cancel = this.spec.clock.after(ms, () => {
        this.stop = undefined;
        resolve(true);
      });
      this.stop = () => {
        cancel();
        resolve(false);
      };
    });
  }

  /** Пауза перед попыткой `n` после сбоя `failure`, мс: от половины ступени до ступени. */
  private pause(n: number, failure: PageDialFailure): number {
    const step = this.step(n, failure);
    return step / 2 + (this.random() * step) / 2;
  }

  private step(n: number, failure: PageDialFailure): number {
    switch (failure) {
      case 'refused':
        return RECONNECT.maxMs;
      case 'closed':
      case 'malformed':
      case 'timeout':
        return Math.min(RECONNECT.maxMs, RECONNECT.baseMs * 2 ** (n - 1));
      default:
        return PageReconnector.unknown(failure);
    }
  }

  /** Вид отказа, которого не знает `switch`, — дефект канала, бросок (ERR-06). */
  private static unknown(value: never): never {
    throw new Error(
      `PageReconnector: неизвестный вид отказа ${JSON.stringify(value)}`,
    );
  }
}
