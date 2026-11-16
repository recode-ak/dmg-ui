import type { Identified } from 'dmg-core';
import * as v from 'valibot';
import { ClientMessage } from '../wire/page-messages';
import type {
  CallMessage,
  ClientMessage as ClientMessageType,
  NotificationMessage,
  WatchMessage,
} from '../wire/page-messages.types';
import type { PageConnectionSpec, PageRecipient } from './page-server.types';

/** Предел подписок одного соединения (Т-17). */
const WATCH_LIMIT = 64;

/**
 * Одно соединение страничного канала на сервере: строки клиента — внешний
 * вход. Мусор, неизвестный `kind`, лишнее поле — ответ `refused`, не бросок
 * (ERR-01); `call` — в сессию личности, `watch`/`unwatch` — подписки по
 * `watchId`. Лог — без данных клиента (ERR-07). Закрытие снимает подписки
 * и сессию.
 */
export class PageConnection<U extends Identified> implements PageRecipient {
  private readonly watches = new Map<string, () => void>();
  private closed = false;

  constructor(private readonly spec: PageConnectionSpec<U>) {}

  /**
   * Строка клиента. Разбор и подписка — синхронно до первого `await`:
   * в каком порядке строки пришли, в таком подписки и стоят (`watch`
   * раньше `call` загрузки). Завершается, когда ответ отправлен.
   */
  async receive(raw: string): Promise<void> {
    if (this.closed) return;
    const message = PageConnection.parse(raw);
    if (message === undefined) {
      this.spec.logger.warn(this.spec.source, 'сообщение клиента не по схеме');
      this.spec.push({ kind: 'refused', reason: 'malformed' });
      return;
    }
    switch (message.kind) {
      case 'call':
        await this.call(message);
        return;
      case 'watch':
        this.watch(message);
        return;
      case 'unwatch':
        this.unwatch(message.watch);
        return;
      default:
        PageConnection.unknown(message);
    }
  }

  /** Уведомление получателю; закрытое соединение его не получает. */
  notify(message: NotificationMessage): void {
    if (!this.closed) this.spec.push(message);
  }

  /** Снять подписки и закрыть сессию; повтор — без действия. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.watches.clear();
    this.spec.session.close();
  }

  /** Вызывающий и след — от сессии: из сообщения берётся только простая команда. */
  private async call({ id, call }: CallMessage): Promise<void> {
    const result = await this.spec.session.call(call);
    if (!this.closed) this.spec.push({ kind: 'result', id, result });
  }

  private watch({ watch, address }: WatchMessage): void {
    if (this.watches.has(watch)) {
      this.refuseWatch(watch, 'повтор id подписки');
      return;
    }
    if (this.watches.size >= WATCH_LIMIT) {
      this.refuseWatch(watch, 'предел подписок соединения');
      return;
    }
    let off: () => void;
    try {
      // Сигнал — без payload, след обезличен (`UiSession.watch`).
      off = this.spec.session.watch(address, (signal) => {
        if (!this.closed) this.spec.push({ kind: 'signal', watch, signal });
      });
    } catch {
      // Адрес клиента не декодируется: бросок ядра на внешнем входе (Т-9).
      this.refuseWatch(watch, 'адрес подписки не декодируется');
      return;
    }
    this.watches.set(watch, off);
  }

  /** Неизвестный `watchId` — молча: подписка могла быть отказана. */
  private unwatch(watch: string): void {
    this.watches.get(watch)?.();
    this.watches.delete(watch);
  }

  /** Отказ подписки: в лог — только причина, без адреса и id клиента. */
  private refuseWatch(watch: string, reason: string): void {
    this.spec.logger.warn(this.spec.source, `подписка не принята: ${reason}`);
    this.spec.push({ kind: 'watch-refused', watch });
  }

  /** Строка клиента → сообщение по схеме; не JSON или не по схеме — `undefined`. */
  private static parse(raw: string): ClientMessageType | undefined {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const parsed = v.safeParse(ClientMessage, json);
    return parsed.success ? parsed.output : undefined;
  }

  /** Сообщение по схеме, которого не знает `switch`, — дефект канала, бросок (ERR-06). */
  private static unknown(message: never): never {
    throw new Error(
      `PageConnection: неизвестное сообщение ${JSON.stringify(message)}`,
    );
  }
}
