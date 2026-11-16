import { err, ok } from 'dmg-core';
import {
  type Delivery,
  type Message,
  MessageFit,
  type MessageHandle,
  type MessengerCapabilities,
  type MessengerPort,
  PlainText,
  type SendOptions,
  type UndeliveredReason,
  type Updated,
} from 'dmg-ui/chat-ui';
import {
  EDITING_CAPABILITIES,
  HANDLE_PREFIX,
  WINDOWED_CAPABILITIES,
} from './memory-messenger.const';
import type {
  MemoryMessengerSpec,
  MemoryOperation,
  MessengerEntry,
} from './memory-messenger.types';

/**
 * Подставной мессенджер в памяти (D-UI-40): одна реализация порта с журналом,
 * поведение выводится из возможностей. Правка на месте — только при `edit` и
 * по handle этого собеседника; снятие вариантов и ответ на нажатие без
 * возможности — `ok` без записи. Инициатива (`initiative: true`, всякий
 * `notify`) проходит при открытом окне; ответ собеседнику (`show`/`update`
 * без инициативы, ответ на нажатие) проходит всегда и сам открывает окно.
 * Строгий: сообщение, которое страж изменил бы (или со ссылкой сверх лимита),
 * и пустой текст без вариантов — `rejected`. Недоставка — значение и запись
 * `undelivered`; на ожидаемые случаи не бросает.
 */
export class MemoryMessenger implements MessengerPort {
  readonly journal: MessengerEntry[] = [];
  readonly capabilities: MessengerCapabilities;
  private readonly clock: () => number;
  private readonly fit: MessageFit;
  /** Последний контакт собеседника, мс. */
  private readonly contacts = new Map<string, number>();
  /** Чей handle: правка на месте — только по handle того же собеседника. */
  private readonly owners = new Map<MessageHandle, string>();
  private shown = 0;
  private failure: UndeliveredReason | undefined;

  constructor(spec: MemoryMessengerSpec) {
    this.capabilities = spec.capabilities;
    this.clock = spec.clock ?? (() => 0);
    this.fit = new MessageFit(spec.capabilities);
  }

  /** «Правит сообщения, вариантов много». */
  static editing(): MemoryMessenger {
    return new MemoryMessenger({ capabilities: EDITING_CAPABILITIES });
  }

  /** «Не правит, три варианта, окно инициативы». */
  static windowed(clock: () => number): MemoryMessenger {
    return new MemoryMessenger({ capabilities: WINDOWED_CAPABILITIES, clock });
  }

  /** Собеседник написал: окно открыто с `clock()`. */
  heard(peer: string): void {
    this.contacts.set(peer, this.clock());
  }

  /** Следующая операция не дойдёт с этой причиной. */
  failNext(reason: UndeliveredReason): void {
    this.failure = reason;
  }

  async show(
    peer: string,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<MessageHandle>> {
    const refused = this.refused(peer, message, this.initiative(peer, send));
    if (refused !== undefined) return this.undelivered('show', peer, refused);
    return ok(this.sent('show', peer, message));
  }

  async update(
    peer: string,
    handle: MessageHandle,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<Updated>> {
    const initiative = this.initiative(peer, send);
    const refused = this.refused(peer, message, initiative);
    if (refused !== undefined) return this.undelivered('update', peer, refused);
    if (!this.capabilities.edit || this.owners.get(handle) !== peer)
      return ok({ handle: this.sent('update', peer, message), edited: false });
    this.journal.push({ op: 'edited', peer, handle, message });
    return ok({ handle, edited: true });
  }

  async retire(
    peer: string,
    handle: MessageHandle,
    message: Message,
    chosen?: string,
  ): Promise<Delivery<void>> {
    const refused = this.refused(peer, message, false);
    if (refused !== undefined) return this.undelivered('retire', peer, refused);
    if (this.capabilities.edit)
      this.journal.push({
        op: 'retired',
        peer,
        handle,
        message,
        ...(chosen === undefined ? {} : { chosen }),
      });
    return ok();
  }

  async answer(
    peer: string,
    press: string,
    text?: string,
  ): Promise<Delivery<void>> {
    this.heard(peer);
    const refused = this.takeFailure() ?? this.answerRejected(text);
    if (refused !== undefined) return this.undelivered('answer', peer, refused);
    if (this.capabilities.pressAnswer !== undefined)
      this.journal.push({
        op: 'answered',
        peer,
        press,
        ...(text === undefined ? {} : { text }),
      });
    return ok();
  }

  async notify(
    peer: string,
    message: Message,
  ): Promise<Delivery<MessageHandle>> {
    const refused = this.refused(peer, message, true);
    if (refused !== undefined) return this.undelivered('notify', peer, refused);
    return ok(this.sent('notify', peer, message));
  }

  /** Признак инициативы; ответ собеседнику — контакт, он открывает окно. */
  private initiative(peer: string, send: SendOptions | undefined): boolean {
    const initiative = send?.initiative === true;
    if (!initiative) this.heard(peer);
    return initiative;
  }

  /** Причина недоставки: заданный сбой, закрытое окно, сообщение сверх лимитов. */
  private refused(
    peer: string,
    message: Message,
    initiative: boolean,
  ): UndeliveredReason | undefined {
    const failure = this.takeFailure();
    if (failure !== undefined) return failure;
    if (initiative && !this.windowOpen(peer)) return 'window';
    return this.fits(message) ? undefined : 'rejected';
  }

  private takeFailure(): UndeliveredReason | undefined {
    const failure = this.failure;
    this.failure = undefined;
    return failure;
  }

  private windowOpen(peer: string): boolean {
    const { initiative } = this.capabilities;
    const contact = this.contacts.get(peer);
    switch (initiative.kind) {
      case 'always':
        return true;
      case 'afterContact':
        return contact !== undefined;
      case 'window':
        return contact !== undefined && this.clock() - contact < initiative.ms;
      default:
        return this.unknownInitiative(initiative);
    }
  }

  /** Сообщение доставимо как есть: страж бы его не изменил, и оно не пустое. */
  private fits(message: Message): boolean {
    const { max, ref } = this.capabilities.options;
    if (message.options.length > max) return false;
    if (message.options.some((option) => option.ref.length > ref)) return false;
    if (this.fit.message(message).cuts.length > 0) return false;
    return message.options.length > 0 || PlainText.of(message.text) !== '';
  }

  private answerRejected(text: string | undefined): 'rejected' | undefined {
    if (text === undefined) return undefined;
    return this.fit.answer(text).cuts.length > 0 ? 'rejected' : undefined;
  }

  private sent(
    via: 'show' | 'update' | 'notify',
    peer: string,
    message: Message,
  ): MessageHandle {
    this.shown += 1;
    const handle = `${HANDLE_PREFIX}${this.shown}`;
    this.owners.set(handle, peer);
    this.journal.push({ op: 'sent', via, peer, handle, message });
    return handle;
  }

  private undelivered(
    via: MemoryOperation,
    peer: string,
    reason: UndeliveredReason,
  ): Delivery<never> {
    this.journal.push({ op: 'undelivered', via, peer, reason });
    return err({ reason });
  }

  private unknownInitiative(initiative: never): never {
    const { kind } = initiative as { readonly kind: string };
    throw new Error(`неизвестный вид инициативы: ${kind}`);
  }
}
