import { err, ok } from 'dmg-core';
import type {
  CommunityPort,
  Delivery,
  Message,
  MessageHandle,
  MessengerCapabilities,
  MessengerPort,
  Updated,
} from 'dmg-ui/chat-ui';
import * as v from 'valibot';
import { SentMessageSchema } from '../bot-api/bot-api.schema';
import type { BotApi } from '../bot-api/bot-api.types';
import { BotApiCaller } from '../bot-api/bot-api-caller';
import type { BotApiOutcome } from '../bot-api/bot-api-caller.types';
import { TelegramCommunity } from '../community/telegram-community';
import { TelegramLog } from '../telegram-log';
import type { TelegramOperation } from '../telegram-log.types';
import { NO_PREVIEW, TELEGRAM_CAPABILITIES } from './telegram.const';
import { telegramInteger } from './telegram-integer';
import { TelegramKeyboard } from './telegram-keyboard';
import type {
  TelegramContent,
  TelegramMessengerSpec,
} from './telegram-messenger.types';
import { TelegramText } from './telegram-text';

const REJECTED = err({ reason: 'rejected' as const });
const UNAVAILABLE = err({ reason: 'unavailable' as const });

/**
 * Мессенджер Telegram поверх порта Bot API (D-UI-61). Собеседник — только
 * целое положительное число (личный чат): неверный ответ `peers` не отправит
 * экран в группу или публичный канал. Уход экрана с `chosen` — отключённая
 * кнопка с подписью нажатого, текст не правится. Методы не бросают (ERR-01):
 * недоставка — значение, бросок порта — `unavailable` и `error`.
 */
export class TelegramMessenger implements MessengerPort {
  readonly capabilities: MessengerCapabilities = TELEGRAM_CAPABILITIES;
  /** Операции группы: на том же порту; в `Communities` идёт мимо стража. */
  readonly community: CommunityPort;
  private readonly api: BotApi;
  private readonly log: TelegramLog;
  private readonly caller: BotApiCaller;

  constructor(spec: TelegramMessengerSpec) {
    this.api = spec.api;
    this.log = new TelegramLog(spec.logger);
    this.caller = new BotApiCaller(this.log);
    this.community = new TelegramCommunity({
      api: spec.api,
      caller: this.caller,
      log: this.log,
      now: spec.now ?? Date.now,
    });
  }

  /** Инициатива не меняет способ: Telegram пишет первым после первого входящего, это сверяет беседа. */
  async show(peer: string, message: Message): Promise<Delivery<MessageHandle>> {
    return this.deliver('show', peer, message);
  }

  async notify(
    peer: string,
    message: Message,
  ): Promise<Delivery<MessageHandle>> {
    return this.deliver('notify', peer, message);
  }

  async update(
    peer: string,
    handle: MessageHandle,
    message: Message,
  ): Promise<Delivery<Updated>> {
    const chat = this.target('update', peer, message);
    if (chat === undefined) return REJECTED;
    const messageId = telegramInteger(handle, 'positive');
    if (messageId === undefined) {
      this.log.badHandle('update');
      return this.resend(chat, message);
    }
    const outcome = await this.caller.call(
      'editMessageText',
      () =>
        this.api.editMessageText({
          chat_id: chat,
          message_id: messageId,
          ...TelegramMessenger.content(TelegramText.of(message.text)),
          reply_markup: TelegramKeyboard.of(message.options),
          link_preview_options: NO_PREVIEW,
        }),
      'update',
    );
    switch (outcome.kind) {
      case 'done':
        return ok({ handle, edited: true });
      case 'refused': {
        if (outcome.failure.notModified()) return ok({ handle, edited: true });
        const reason = outcome.failure.reason();
        if (reason === 'rejected') return this.resend(chat, message);
        return err({ reason });
      }
      case 'failed':
        return UNAVAILABLE;
      default:
        outcome satisfies never;
        return UNAVAILABLE;
    }
  }

  async retire(
    peer: string,
    handle: MessageHandle,
    message: Message,
    chosen?: string,
  ): Promise<Delivery<void>> {
    const chat = this.target('retire', peer);
    if (chat === undefined) return REJECTED;
    const messageId = telegramInteger(handle, 'positive');
    if (messageId === undefined) {
      this.log.badHandle('retire');
      return REJECTED;
    }
    const label = message.options.find(
      (option) => option.ref === chosen,
    )?.label;
    const outcome = await this.caller.call(
      'editMessageReplyMarkup',
      () =>
        this.api.editMessageReplyMarkup({
          chat_id: chat,
          message_id: messageId,
          ...(label === undefined
            ? {}
            : { reply_markup: TelegramKeyboard.retired(label) }),
        }),
      'retire',
    );
    return TelegramMessenger.settled(outcome);
  }

  async answer(
    // biome-ignore lint/correctness/noUnusedFunctionParameters: ответ на нажатие — по его id, собеседник Bot API не нужен
    peer: string,
    press: string,
    text?: string,
  ): Promise<Delivery<void>> {
    return this.answerPress(press, text);
  }

  /** Ответ на нажатие по его id: у беседы и у нажатия, отвергнутого приёмом апдейтов (собеседника у такого нет). */
  async answerPress(press: string, text?: string): Promise<Delivery<void>> {
    const outcome = await this.caller.call('answerCallbackQuery', () =>
      this.api.answerCallbackQuery(
        text === undefined
          ? { callback_query_id: press }
          : { callback_query_id: press, text: text.toWellFormed() },
      ),
    );
    return TelegramMessenger.settled(outcome);
  }

  private async deliver(
    operation: 'show' | 'notify',
    peer: string,
    message: Message,
  ): Promise<Delivery<MessageHandle>> {
    const chat = this.target(operation, peer, message);
    if (chat === undefined) return REJECTED;
    return this.send(operation, chat, message);
  }

  /** Откат правки: новое сообщение вместо прежнего. */
  private async resend(
    chat: number,
    message: Message,
  ): Promise<Delivery<Updated>> {
    const sent = await this.send('update', chat, message);
    return sent.ok ? ok({ handle: sent.value, edited: false }) : sent;
  }

  private async send(
    operation: 'show' | 'notify' | 'update',
    chat: number,
    message: Message,
  ): Promise<Delivery<MessageHandle>> {
    const outcome = await this.caller.call(
      'sendMessage',
      () =>
        this.api.sendMessage({
          chat_id: chat,
          ...TelegramMessenger.content(TelegramText.of(message.text)),
          ...(message.options.length > 0
            ? { reply_markup: TelegramKeyboard.of(message.options) }
            : {}),
          link_preview_options: NO_PREVIEW,
        }),
      operation,
    );
    switch (outcome.kind) {
      case 'done': {
        const sent = v.safeParse(SentMessageSchema, outcome.result);
        if (sent.success) return ok(String(sent.output.message_id));
        this.log.badResult('sendMessage', operation);
        return UNAVAILABLE;
      }
      case 'refused':
        return err({ reason: outcome.failure.reason() });
      case 'failed':
        return UNAVAILABLE;
      default:
        outcome satisfies never;
        return UNAVAILABLE;
    }
  }

  /**
   * Чат собеседника или `undefined` с записью `error`: собеседник не целое
   * положительное или `callback_data` варианта вне 1–64 байт — без вызова API.
   */
  private target(
    operation: TelegramOperation,
    peer: string,
    message?: Message,
  ): number | undefined {
    const chat = telegramInteger(peer, 'positive');
    if (chat === undefined) {
      this.log.badPeer(operation);
      return undefined;
    }
    if (message !== undefined && !TelegramKeyboard.fits(message.options)) {
      this.log.badCallbackData(operation);
      return undefined;
    }
    return chat;
  }

  /** Итог правки без нового handle: «not modified» — тоже `ok`. */
  private static settled(outcome: BotApiOutcome): Delivery<void> {
    switch (outcome.kind) {
      case 'done':
        return ok();
      case 'refused':
        return outcome.failure.notModified()
          ? ok()
          : err({ reason: outcome.failure.reason() });
      case 'failed':
        return UNAVAILABLE;
      default:
        outcome satisfies never;
        return UNAVAILABLE;
    }
  }

  /** Поля текста запроса; сущностей нет — поля нет. */
  private static content(content: TelegramContent): {
    readonly text: string;
    readonly entities?: TelegramContent['entities'];
  } {
    return content.entities.length > 0
      ? { text: content.text, entities: content.entities }
      : { text: content.text };
  }
}
