import { ok } from 'dmg-core';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import type {
  Delivery,
  MessageHandle,
  MessengerCapabilities,
  MessengerPort,
  Updated,
} from '../messenger/messenger.types';
import type { DialogReply } from './dialog.types';

/** Предел текста и подписей с запасом: тексты учебного примера не режутся. */
const ROOMY_TEXT = { max: 1_000_000, unit: 'utf16' } as const;

/**
 * Возможности мессенджера реплик: не правит, вариантов с запасом (раскладка
 * всегда целиком), ссылки беседы помещаются, писать первым можно всегда.
 */
export const REPLY_CAPABILITIES: MessengerCapabilities = {
  name: 'dialog-replies',
  kinds: ['text'],
  edit: false,
  text: ROOMY_TEXT,
  textWithOptions: ROOMY_TEXT,
  options: { max: 1_000, label: ROOMY_TEXT, ref: 64 },
  form: false,
  initiative: { kind: 'always' },
  community: { signals: [], operations: [] },
};

/**
 * Мессенджер учебного диалога: каждое показанное сообщение — реплика
 * `DialogReply` (видимый текст и варианты как есть), уведомление — реплика
 * во входящие; уход вариантов и ответ на нажатие — ничего. Недоставки нет.
 */
export class ReplyMessenger implements MessengerPort {
  readonly capabilities = REPLY_CAPABILITIES;
  private shown = 0;

  constructor(
    private readonly replies: DialogReply[],
    private readonly inbox: DialogReply[],
  ) {}

  async show(
    _peer: string,
    message: Message,
  ): Promise<Delivery<MessageHandle>> {
    return ok(this.push(this.replies, message));
  }

  /** Правки нет: каждое обновление — новая реплика. */
  async update(
    _peer: string,
    _handle: MessageHandle,
    message: Message,
  ): Promise<Delivery<Updated>> {
    return ok({ handle: this.push(this.replies, message), edited: false });
  }

  async retire(): Promise<Delivery<void>> {
    return ok();
  }

  async answer(): Promise<Delivery<void>> {
    return ok();
  }

  async notify(
    _peer: string,
    message: Message,
  ): Promise<Delivery<MessageHandle>> {
    return ok(this.push(this.inbox, message));
  }

  private push(to: DialogReply[], message: Message): MessageHandle {
    to.push({
      text: PlainText.of(message.text),
      options: message.options.map(({ ref, label }) => ({ ref, label })),
    });
    this.shown += 1;
    return `reply-${this.shown}`;
  }
}
