import { CoreErrors, ErrorDef, err } from 'dmg-core';
import type { ServerMessage } from '../wire/page-messages.types';
import { MAX_SERVER_TEXT } from '../wire/page-wire.const';
import { OUTBOX_WARNINGS } from './page-server.const';
import type { PageOutboxSpec } from './page-server.types';

/**
 * Отправка сообщений сервера одному соединению: сериализация одна, предел
 * `MAX_SERVER_TEXT` меряется на той строке, что уходит в сокет. Длинный
 * `result` заменяется отказом с тем же `id` — вызов не висит; длинное
 * уведомление и прочее отбрасываются. `warn` — фиксированный текст, раз на вид.
 */
export class PageOutbox {
  /** Тексты `warn`, уже записанные этим соединением. */
  private readonly warned = new Set<string>();

  constructor(private readonly spec: PageOutboxSpec) {}

  push(message: ServerMessage): void {
    const text = JSON.stringify(message);
    if (text.length <= MAX_SERVER_TEXT) {
      this.spec.send(text);
      return;
    }
    switch (message.kind) {
      case 'result': {
        this.warnOnce(OUTBOX_WARNINGS.result);
        const internal = ErrorDef.serialize(CoreErrors.SERVER_INTERNAL.make());
        this.spec.send(
          JSON.stringify({
            kind: 'result',
            id: message.id,
            result: err(internal),
          }),
        );
        return;
      }
      case 'notification':
        this.warnOnce(OUTBOX_WARNINGS.notification);
        return;
      case 'hello':
      case 'signal':
      case 'watch-refused':
      case 'refused':
        // Ограничены схемой: длинная строка — дефект сервера, не данные.
        this.warnOnce(OUTBOX_WARNINGS.other);
        return;
      default:
        PageOutbox.unknown(message);
    }
  }

  private warnOnce(text: string): void {
    if (this.warned.has(text)) return;
    this.warned.add(text);
    this.spec.logger.warn(this.spec.source, text);
  }

  /** Сообщение, которого не знает `switch`, — дефект канала, бросок (ERR-06). */
  private static unknown(message: never): never {
    throw new Error(
      `PageOutbox: неизвестный вид сообщения ${(message as { kind: string }).kind}`,
    );
  }
}
