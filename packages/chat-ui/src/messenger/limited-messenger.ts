import * as v from 'valibot';
import type { Message } from '../message/message.types';
import { MessengerCapabilitiesSchema } from './capabilities-schema';
import { MessageFit } from './message-fit';
import { LIMIT_TEXTS, LOG_SOURCE } from './messenger.const';
import type {
  Delivery,
  LimitCut,
  LimitedMessengerSpec,
  MessageHandle,
  MessengerCapabilities,
  MessengerOperation,
  MessengerPort,
  SendOptions,
  Updated,
} from './messenger.types';

/**
 * Страж лимитов перед портом (D-UI-39): подгоняет сообщение и ответ на
 * нажатие под возможности порта (`MessageFit`), пишет по записи на каждый
 * разрез — обрезка `warn`, лишние варианты `error` — и отдаёт итог порта как
 * есть. В записи — мессенджер, операция и разрез; ни текста, ни подписей, ни
 * собеседника, ни ссылок (ERR-07). Ссылка варианта сверх лимита — бросок
 * (отклонённый промис), порт не вызывается.
 */
export class LimitedMessenger implements MessengerPort {
  readonly capabilities: MessengerCapabilities;
  private readonly port: MessengerPort;
  private readonly logger: LimitedMessengerSpec['logger'];
  private readonly fit: MessageFit;

  /** Возможности порта не по схеме — бросок при сборке. */
  constructor(spec: LimitedMessengerSpec) {
    v.parse(MessengerCapabilitiesSchema, spec.port.capabilities);
    this.capabilities = spec.port.capabilities;
    this.port = spec.port;
    this.logger = spec.logger;
    this.fit = new MessageFit(this.capabilities);
  }

  async show(
    peer: string,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<MessageHandle>> {
    return this.port.show(peer, this.fitted('show', message), send);
  }

  async update(
    peer: string,
    handle: MessageHandle,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<Updated>> {
    return this.port.update(peer, handle, this.fitted('update', message), send);
  }

  async retire(
    peer: string,
    handle: MessageHandle,
    message: Message,
    chosen?: string,
  ): Promise<Delivery<void>> {
    return this.port.retire(
      peer,
      handle,
      this.fitted('retire', message),
      chosen,
    );
  }

  async answer(
    peer: string,
    press: string,
    text?: string,
  ): Promise<Delivery<void>> {
    if (text === undefined) return this.port.answer(peer, press, text);
    const fitted = this.fit.answer(text);
    this.record('answer', fitted.cuts);
    return this.port.answer(peer, press, fitted.value);
  }

  async notify(
    peer: string,
    message: Message,
  ): Promise<Delivery<MessageHandle>> {
    return this.port.notify(peer, this.fitted('notify', message));
  }

  private fitted(operation: MessengerOperation, message: Message): Message {
    const fitted = this.fit.message(message);
    this.record(operation, fitted.cuts);
    return fitted.value;
  }

  private record(
    operation: MessengerOperation,
    cuts: readonly LimitCut[],
  ): void {
    for (const cut of cuts) {
      const meta = { messenger: this.capabilities.name, operation, ...cut };
      switch (cut.limit) {
        case 'options':
          this.logger.error(LOG_SOURCE, LIMIT_TEXTS.dropped, meta);
          break;
        case 'text':
        case 'textWithOptions':
        case 'label':
        case 'pressAnswer':
          this.logger.warn(LOG_SOURCE, LIMIT_TEXTS.trimmed, meta);
          break;
        default:
          this.unknownLimit(cut.limit);
      }
    }
  }

  private unknownLimit(limit: never): never {
    throw new Error(`неизвестный лимит: ${String(limit)}`);
  }
}
