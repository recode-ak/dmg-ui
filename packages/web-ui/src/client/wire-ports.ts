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
import type { PendingCall, PortMessage, PortWatch } from './page-client.types';

/**
 * Порты исполнителя экранов поверх клиентского конца провода: `call` —
 * сообщение `call` и ожидание `result` (или `refused`) с тем же `id`;
 * `watch` — сообщение `watch` и сигналы по `watchId`. Подписка уходит раньше
 * `call` загрузки — провод сохраняет порядок (D-UI-33). Отвод `onSignal`
 * узнаёт адрес подписки каждого сигнала — начало перечитывания для состояния
 * области. Обрыв текущего конца — «без связи» до `attach` (D-UI-74): команда
 * повторно не уходит никогда.
 * @see ./wire-ports.test.ts
 */
export class WirePorts implements UcPort, RefreshPort {
  private readonly watches = new Map<string, PortWatch>();
  private readonly pending = new Map<string, PendingCall>();
  /** Текущий живой конец; нет — связи нет. */
  private end: ClientEnd | undefined;
  private next = 0;

  constructor(
    end: ClientEnd,
    private readonly onSignal?: (address: AddressJson) => void,
  ) {
    this.attach(end);
  }

  /**
   * Новый конец провода. Живой прежний снимается как оборванный: его
   * ожидающие вызовы отказаны, подписки забыты. Обрыв прежнего конца после
   * смены ничего не трогает.
   */
  attach(end: ClientEnd): void {
    if (this.end !== undefined) {
      this.drop(new Error('WirePorts: соединение заменено'));
    }
    this.end = end;
    end.onBreak((error) => {
      if (this.end === end) this.drop(error);
    });
  }

  /**
   * Вызов не по схеме провода или длиннее предела строки — дефект сборки
   * клиента: отказ промиса до отправки (длинному сервер не ответил бы по
   * `id`); исполнитель превращает его в отказ экрана.
   */
  call(call: UcCall): Promise<SerializedResult> {
    const end = this.end;
    if (end === undefined) {
      return Promise.reject(
        new Error(`WirePorts: нет соединения, вызов ${call.uc} не отправлен`),
      );
    }
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
      end.send(message);
    });
  }

  /** Без связи подписка не регистрируется: экземпляр перечитают по соединению. */
  watch(
    address: AddressJson,
    listener: (signal: RefreshSignal) => void,
  ): () => void {
    const end = this.end;
    if (end === undefined) return () => {};
    const watch = this.id('w');
    this.watches.set(watch, { listener, address });
    end.send({ kind: 'watch', watch, address });
    return () => {
      // Снятую обрывом или отказанную сервером подписку снимать на сервере
      // нечего; живая подписка — всегда на текущем конце.
      if (this.watches.delete(watch)) {
        end.send({ kind: 'unwatch', watch });
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
      case 'signal': {
        const watch = this.watches.get(message.watch);
        if (watch === undefined) return;
        // Сначала слушатель: ядро ставит перечитывание в очередь сразу, и
        // `settled()` из отвода его дождётся; в обратном порядке — нет (D-UI-49).
        watch.listener(message.signal);
        this.onSignal?.(watch.address);
        return;
      }
      case 'watch-refused':
        // Экземпляр живёт без перечитывания: сигналов по ней не будет.
        this.watches.delete(message.watch);
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

  /**
   * Обрыв текущего конца: ответов не будет — отказ всех ожидающих; подписки
   * на сервере уже сняты — реестр пуст; дальше — без связи.
   */
  private drop(error: Error): void {
    this.end = undefined;
    this.watches.clear();
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
