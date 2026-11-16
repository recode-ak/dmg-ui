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
import type { ClientEnd } from '../wire/page-wire.types';
import type { PortMessage } from './page-client.types';

/**
 * Порты исполнителя экранов поверх клиентского конца провода: `call` —
 * сообщение `call` и ожидание `result` с тем же `id`; `watch` — сообщение
 * `watch` и сигналы по `watchId`. Отписка синхронная, как требует
 * исполнитель; подписка уходит раньше `call` загрузки — провод сохраняет
 * порядок (расхождение 4 брифа Ф6).
 */
export class WirePorts implements UcPort, RefreshPort {
  private readonly listeners = new Map<
    string,
    (signal: RefreshSignal) => void
  >();
  private readonly pending = new Map<
    string,
    (result: SerializedResult) => void
  >();
  private next = 0;

  constructor(private readonly end: ClientEnd) {}

  /**
   * Вызов не по схеме провода (имя длиннее предела, `requestId` пуст) сервер
   * отказал бы `refused` без `id` — ответ не пришёл бы никогда. Это дефект
   * сборки клиента: отказ промиса, исполнитель превращает его в отказ экрана.
   */
  call(call: UcCall): Promise<SerializedResult> {
    const id = this.id('c');
    const message: CallMessage = { kind: 'call', id, call };
    if (!v.safeParse(ClientMessage, message).success) {
      return Promise.reject(
        new Error(`WirePorts: вызов ${call.uc} не по схеме провода`),
      );
    }
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
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
      case 'result': {
        const resolve = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolve?.(message.result);
        return;
      }
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
