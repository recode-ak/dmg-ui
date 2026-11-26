import type { ServerContext } from 'dmg-ui/server';
import { LOG_SOURCE } from '../messenger/messenger.const';
import type {
  MessengerOperation,
  UndeliveredReason,
} from '../messenger/messenger.types';
import { CONVERSATION_TEXTS } from './conversation.const';
import type {
  ConversationSignal,
  LinkOperation,
  LinkRejection,
} from './conversation.types';

/**
 * Записи лога беседы и узла бесед. В `meta` — только имя мессенджера, вид
 * сигнала, причина, операция и имя ошибки: ни собеседника, ни отправителя,
 * ни uuid, ни id сигнала, ни текста, ссылок, подписей, `handle` и текста
 * броска (ERR-07).
 */
export class ConversationLog {
  constructor(
    private readonly logger: ServerContext['logger'],
    private readonly messenger: string,
  ) {}

  /** Сигнал отвергнут по пределу: собеседник, длина id, текста, параметра входа или JSON адреса. */
  rejected(
    kind: ConversationSignal['kind'],
    reason: 'peer' | 'signalId' | 'text',
  ): void {
    this.warn(CONVERSATION_TEXTS.signalRejected, { kind, reason });
  }

  /** Сигнал не исполнен: нет личности или она не владелец беседы. */
  refused(
    kind: ConversationSignal['kind'],
    text:
      | typeof CONVERSATION_TEXTS.noPerson
      | typeof CONVERSATION_TEXTS.foreign,
  ): void {
    this.warn(text, { kind });
  }

  /** Уведомления нет в наборе приложения. */
  noNotification(): void {
    this.warn(CONVERSATION_TEXTS.noNotification, {});
  }

  /** У получателя уведомления нет собеседника. */
  noPeer(): void {
    this.warn(CONVERSATION_TEXTS.noPeer, {});
  }

  /** В беседе собеседника другая личность. */
  noticeForeign(): void {
    this.warn(CONVERSATION_TEXTS.noticeForeign, {});
  }

  badSnapshot(): void {
    this.warn(CONVERSATION_TEXTS.badSnapshot, {});
  }

  /** Снимок перед записью не по схеме: не записан; ни значений, ни путей. */
  badSave(): void {
    this.logger.error(LOG_SOURCE, CONVERSATION_TEXTS.badSave, {
      messenger: this.messenger,
      operation: 'save',
      reason: 'schema',
    });
  }

  undelivered(operation: MessengerOperation, reason: UndeliveredReason): void {
    this.warn(CONVERSATION_TEXTS.undelivered, { operation, reason });
  }

  /** Сбой хранилища: чтение — сигнал не исполнен, запись — беседа в памяти; имя ошибки без её текста. */
  storeFailed(operation: 'load' | 'save', error: unknown): void {
    const text =
      operation === 'load'
        ? CONVERSATION_TEXTS.loadFailed
        : CONVERSATION_TEXTS.saveFailed;
    this.logger.error(LOG_SOURCE, text, {
      messenger: this.messenger,
      operation,
      name: ConversationLog.nameOf(error),
    });
  }

  /** Дефект беседы на сигнале, проактивном показе, уведомлении или в приёмнике выхода: имя ошибки без её текста. */
  defect(
    cause:
      | { readonly kind: ConversationSignal['kind'] }
      | { readonly operation: 'refresh' | 'notify' | 'exit' },
    error: unknown,
  ): void {
    this.logger.error(LOG_SOURCE, CONVERSATION_TEXTS.defect, {
      messenger: this.messenger,
      ...cause,
      name: ConversationLog.nameOf(error),
    });
  }

  /** Ссылка на экран выдана (`/link`, D-UI-127): ни кода, ни URL, ни адреса. */
  linkIssued(): void {
    this.info(CONVERSATION_TEXTS.linkIssued, { event: 'link-issued' });
  }

  /** Экран открыт по коду (`enter`) или по адресу проекта (`open`): ни кода, ни адреса. */
  linkOpened(kind: 'enter' | 'open'): void {
    this.info(CONVERSATION_TEXTS.linkOpened, { event: 'link-opened', kind });
  }

  /** Код или адрес не открыт — вход сигнала; причина без кода и адреса. */
  linkRejected(kind: 'enter' | 'open', reason: LinkRejection): void {
    this.info(CONVERSATION_TEXTS.linkRejected, {
      event: 'link-rejected',
      kind,
      reason,
    });
  }

  /** Под кодом адреса в хранилище другой адрес: ссылка не выдана, запись не тронута. */
  linkCollision(): void {
    this.logger.error(LOG_SOURCE, CONVERSATION_TEXTS.linkCollision, {
      messenger: this.messenger,
      operation: 'issue',
    });
  }

  /** Бросок кода ссылки, хранилища ссылок или URL проекта: имя ошибки без её текста. */
  linkFailed(operation: LinkOperation, error: unknown): void {
    this.logger.error(LOG_SOURCE, CONVERSATION_TEXTS.linkStoreFailed, {
      messenger: this.messenger,
      operation,
      name: ConversationLog.nameOf(error),
    });
  }

  private info(text: string, meta: Record<string, string>): void {
    this.logger.info(LOG_SOURCE, text, { messenger: this.messenger, ...meta });
  }

  private warn(text: string, meta: Record<string, string>): void {
    this.logger.warn(LOG_SOURCE, text, { messenger: this.messenger, ...meta });
  }

  private static nameOf(error: unknown): string {
    return error instanceof Error ? error.name : typeof error;
  }
}
