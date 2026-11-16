import type { SerializedResult } from 'dmg-core';
import type {
  AddressJson,
  RefreshPort,
  RefreshSignal,
  UcCall,
  UcPort,
} from 'dmg-ui';
import * as v from 'valibot';
import { ClientMessage } from '../wire/page-messages';
import type { CallMessage } from '../wire/page-messages.types';
import { MAX_CLIENT_TEXT } from '../wire/page-wire.const';
import type { ClientEnd } from '../wire/page-wire.types';
import type { PendingCall, PortMessage } from './page-client.types';

/**
 * Порты исполнителя экранов поверх клиентского конца провода: `call` —
 * сообщение `call` и ожидание `result` (или `refused`) с тем же `id`;
 * `watch` — сообщение `watch` и сигналы по `watchId`. Обрыв провода
 * отказывает все ожидающие вызовы. Подписка уходит раньше `call` загрузки —
 * провод сохраняет порядок (расхождение 4 брифа Ф6).
 */
export class WirePorts implements UcPort, RefreshPort {
  private readonly listeners = new Map<
    string,
    (signal: RefreshSignal) => void
  >();
  private readonly pending = new Map<string, PendingCall>();
  private next = 0;

  constructor(private readonly end: ClientEnd) {
    end.onBreak((error) => this.fail(error));
  }

  /**
   * Вызов не по схеме провода или длиннее предела строки — дефект сборки
   * клиента: отказ промиса до отправки (длинному сервер не ответил бы по
   * `id`); исполнитель превращает его в отказ экрана.
   */
  call(call: UcCall): Promise<SerializedResult> {
    const id = this.id('c');
    const message: CallMessage = { kind: 'call', id, call };
    if (!v.safeParse(ClientMessage, message).success) {
      return Promise.reject(
        new Error(`WirePorts: вызов ${call.uc} не по схеме провода`),
      );
    }
    if (JSON.stringify(message).length > MAX_CLIENT_TEXT) {
      return Promise.reject(
        new Error(`WirePorts: вызов ${call.uc} длиннее предела провода`),
      );
    }
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.end.send(message);
    });
  }

  watch(
    address: AddressJson,
    listener: (signal: RefreshSignal) => void,
  ): () => void {
    const watch = this.id('w');
    this.listeners.set(watch, listener);
    this.end.send({ kind: 'watch', watch, address });
    return () => {
      // Снятую или отказанную сервером подписку снимать на сервере нечего.
      if (this.listeners.delete(watch)) {
        this.end.send({ kind: 'unwatch', watch });
      }
    };
  }

  /** Сообщение сервера портам: неизвестный `id` или `watchId` — молча. */
  receive(message: PortMessage): void {
    switch (message.kind) {
      case 'result':
        this.take(message.id)?.resolve(message.result);
        return;
      case 'refused':
        // Без `id` сопоставить не с чем: клиент шлёт только по схеме.
        if (message.id !== undefined) {
          this.take(message.id)?.reject(
            new Error(`WirePorts: сервер отклонил вызов (${message.reason})`),
          );
        }
        return;
      case 'signal':
        this.listeners.get(message.watch)?.(message.signal);
        return;
      case 'watch-refused':
        // Экземпляр живёт без перечитывания: сигналов по ней не будет.
        this.listeners.delete(message.watch);
        return;
      default:
        WirePorts.unknown(message);
    }
  }

  /** Ожидающий вызов `id`, снятый с ожидания; неизвестный — `undefined`. */
  private take(id: string): PendingCall | undefined {
    const call = this.pending.get(id);
    this.pending.delete(id);
    return call;
  }

  /** Обрыв провода: ответов не будет — отказ всех ожидающих. */
  private fail(error: Error): void {
    const calls = [...this.pending.values()];
    this.pending.clear();
    for (const call of calls) call.reject(error);
  }

  private id(prefix: string): string {
    this.next += 1;
    return `${prefix}${this.next}`;
  }

  /** Сообщение, которого не знает `switch`, — дефект канала, бросок (ERR-06). */
  private static unknown(message: never): never {
    throw new Error(
      `WirePorts: неизвестное сообщение ${JSON.stringify(message)}`,
    );
  }
}
