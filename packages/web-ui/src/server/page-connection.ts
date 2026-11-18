import { CoreErrors, ErrorDef, err, type Identified } from 'dmg-core';
import * as v from 'valibot';
import { CallEnvelope, ClientMessage } from '../wire/page-messages';
import type {
  CallMessage,
  NotificationMessage,
  WatchMessage,
} from '../wire/page-messages.types';
import { MAX_CLIENT_TEXT } from '../wire/page-wire.const';
import { CALL_LIMIT, WATCH_LIMIT } from './page-server.const';
import type {
  PageConnectionSpec,
  PageRecipient,
  ParsedLine,
} from './page-server.types';

/**
 * Одно соединение страничного канала на сервере: строки клиента — внешний
 * вход. Мусор и строка длиннее предела — `refused`, не бросок (ERR-01);
 * `call` — в сессию личности (не больше `CALL_LIMIT` разом), `watch` —
 * подписки по `watchId`. `warn` — без данных клиента (ERR-07); на мусор,
 * предел вызовов и каждый вид отказа подписки — раз на соединение.
 */
export class PageConnection<U extends Identified> implements PageRecipient {
  private readonly watches = new Map<string, () => void>();
  /** Тексты `warn`, уже записанные этим соединением. */
  private readonly warned = new Set<string>();
  private calls = 0;
  private closed = false;

  constructor(private readonly spec: PageConnectionSpec<U>) {}

  /**
   * Строка клиента. Разбор и подписка — синхронно до первого `await`:
   * в каком порядке строки пришли, в таком подписки и стоят (`watch`
   * раньше `call` загрузки). Завершается, когда ответ отправлен.
   */
  async receive(raw: string): Promise<void> {
    if (this.closed) return;
    const parsed = PageConnection.parse(raw);
    if ('refused' in parsed) {
      this.warnOnce(
        parsed.refused.reason === 'too-large'
          ? 'строка клиента длиннее предела'
          : 'сообщение клиента не по схеме',
      );
      this.spec.push(parsed.refused);
      return;
    }
    const { message } = parsed;
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

  /**
   * Вызывающий и след — от сессии: из сообщения берётся только простая
   * команда. Сверх предела одновременных — `SERVER_INTERNAL` без вызова.
   */
  private async call({ id, call }: CallMessage): Promise<void> {
    if (this.calls >= CALL_LIMIT) {
      this.warnOnce('предел одновременных вызовов соединения');
      const busy = ErrorDef.serialize(CoreErrors.SERVER_INTERNAL.make());
      this.spec.push({ kind: 'result', id, result: err(busy) });
      return;
    }
    this.calls += 1;
    try {
      const result = await this.spec.session.call(call);
      if (!this.closed) this.spec.push({ kind: 'result', id, result });
    } finally {
      this.calls -= 1;
    }
  }

  private watch({ watch, address }: WatchMessage): void {
    if (this.watches.has(watch)) {
      this.refuseWatch(watch, 'подписка не принята: повтор id');
      return;
    }
    if (this.watches.size >= WATCH_LIMIT) {
      this.refuseWatch(watch, 'подписка не принята: предел соединения');
      return;
    }
    let off: () => void;
    try {
      // Сигнал — без payload, след обезличен (`UiSession.watch`).
      off = this.spec.session.watch(address, (signal) => {
        if (!this.closed) this.spec.push({ kind: 'signal', watch, signal });
      });
    } catch {
      // Бросок ядра на внешнем входе (ERR-01): причина — не только адрес.
      this.refuseWatch(watch, 'подписка отклонена');
      return;
    }
    this.watches.set(watch, off);
  }

  /** Неизвестный `watchId` — молча: подписка могла быть отказана. */
  private unwatch(watch: string): void {
    this.watches.get(watch)?.();
    this.watches.delete(watch);
  }

  /**
   * Отказ подписки: клиенту — `watch-refused` на каждый кадр, в лог —
   * фиксированный текст вида отказа раз на соединение, без адреса и id
   * клиента.
   */
  private refuseWatch(watch: string, text: string): void {
    this.warnOnce(text);
    this.spec.push({ kind: 'watch-refused', watch });
  }

  /** `warn` с фиксированным текстом — один раз на соединение. */
  private warnOnce(text: string): void {
    if (this.warned.has(text)) return;
    this.warned.add(text);
    this.spec.logger.warn(this.spec.source, text);
  }

  /**
   * Строка клиента → сообщение по схеме. Длиннее предела — `too-large` без
   * разбора; не по схеме — `malformed` с `id`, если разобрался конверт `call`.
   */
  private static parse(raw: string): ParsedLine {
    if (raw.length > MAX_CLIENT_TEXT) {
      return { refused: { kind: 'refused', reason: 'too-large' } };
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { refused: { kind: 'refused', reason: 'malformed' } };
    }
    const parsed = v.safeParse(ClientMessage, json);
    if (parsed.success) return { message: parsed.output };
    const envelope = v.safeParse(CallEnvelope, json);
    return {
      refused: envelope.success
        ? { kind: 'refused', reason: 'malformed', id: envelope.output.id }
        : { kind: 'refused', reason: 'malformed' },
    };
  }

  /** Сообщение по схеме, которого не знает `switch`, — дефект канала, бросок (ERR-06). */
  private static unknown(message: never): never {
    throw new Error(
      `PageConnection: неизвестное сообщение ${JSON.stringify(message)}`,
    );
  }
}
