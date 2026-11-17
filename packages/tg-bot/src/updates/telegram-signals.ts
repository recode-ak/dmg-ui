import type {
  Attachment,
  ConversationSignal,
  SignalHead,
} from 'dmg-ui/chat-ui';
import * as v from 'valibot';
import { PressIdSchema, TelegramUpdateSchema } from './telegram-update.schema';
import {
  ATTACHMENT_FIELDS,
  BOT_COMMAND,
  COMMAND,
  START_PARAM,
} from './telegram-updates.const';
import type {
  CallbackQuery,
  SignalOutcome,
  TelegramMessage,
  UpdateRefusal,
} from './telegram-updates.types';

const IGNORED: SignalOutcome = { kind: 'ignored' };

/**
 * Перевод апдейта Bot API в сигнал беседы (D-UI-62) — чистый, без порта и
 * лога. Диалог — только личный чат, где отправитель и собеседник — один
 * человек: `chat.type === 'private'`, целое `chat.id` > 0, `from.id ===
 * chat.id`. Поля сигнала — строки: `id` — `update_id`, `peer` — `chat.id`,
 * `sender` — `from.id`. Сообщение вне личного чата и прочие виды апдейтов —
 * «ничего»; отвергнутое нажатие несёт свой id — ответ обязателен.
 */
export class TelegramSignals {
  /** `id` — `update_id` апдейта строкой. */
  private constructor(private readonly id: string) {}

  static of(update: unknown): SignalOutcome {
    const parsed = v.safeParse(TelegramUpdateSchema, update);
    if (!parsed.success) return TelegramSignals.unreadable(update);
    const { update_id, message, callback_query } = parsed.output;
    const signals = new TelegramSignals(String(update_id));
    if (callback_query !== undefined) return signals.press(callback_query);
    if (message !== undefined) return signals.message(message);
    return IGNORED;
  }

  /** Апдейт не по схеме; id нажатия читается — отказ с ним. */
  private static unreadable(update: unknown): SignalOutcome {
    const press = v.safeParse(PressIdSchema, update);
    return press.success
      ? TelegramSignals.refusedPress('schema', press.output.callback_query.id)
      : { kind: 'refused', reason: 'schema' };
  }

  private press(query: CallbackQuery): SignalOutcome {
    if (query.message === undefined) {
      return TelegramSignals.refusedPress('inline', query.id);
    }
    const { chat } = query.message;
    if (!TelegramSignals.dialog(chat)) {
      return TelegramSignals.refusedPress('chat', query.id);
    }
    if (query.from.id !== chat.id) {
      return TelegramSignals.refusedPress('sender', query.id);
    }
    if (query.data === undefined) {
      return TelegramSignals.refusedPress('data', query.id);
    }
    const head = this.head(chat.id);
    return TelegramSignals.signal({
      ...head,
      kind: 'press',
      ref: query.data,
      press: query.id,
    });
  }

  private message(message: TelegramMessage): SignalOutcome {
    const { chat, from } = message;
    if (chat.type !== 'private') return IGNORED;
    if (!TelegramSignals.dialog(chat)) {
      return TelegramSignals.refusedMessage('chat');
    }
    if (from === undefined || from.id !== chat.id) {
      return TelegramSignals.refusedMessage('sender');
    }
    const head = this.head(chat.id);
    if (message.text !== undefined) {
      return TelegramSignals.signal(
        TelegramSignals.command(head, message) ?? {
          ...head,
          kind: 'text',
          text: message.text,
        },
      );
    }
    const attachment = TelegramSignals.attachment(message);
    return attachment === undefined
      ? IGNORED
      : TelegramSignals.signal({ ...head, kind: 'attachment', attachment });
  }

  /**
   * Текст, начинающийся сущностью `bot_command`: `start` (с параметром
   * глубокой ссылки), `cancel`, `back`; прочие — вход по имени (незнакомое
   * встретит беседа). Иначе `undefined` — обычный текст.
   */
  private static command(
    head: SignalHead,
    message: TelegramMessage,
  ): ConversationSignal | undefined {
    const text = message.text ?? '';
    const entity = message.entities?.find(
      (one) => one.type === BOT_COMMAND && one.offset === 0,
    );
    if (entity === undefined) return undefined;
    const name = COMMAND.exec(text.slice(0, entity.length))?.[1];
    if (name === undefined) return undefined;
    switch (name) {
      case 'start': {
        const param = text.slice(entity.length).trim();
        return START_PARAM.test(param)
          ? { ...head, kind: 'enter', entry: name, param }
          : { ...head, kind: 'enter', entry: name };
      }
      case 'cancel':
        return { ...head, kind: 'cancel' };
      case 'back':
        return { ...head, kind: 'back' };
      default:
        return { ...head, kind: 'enter', entry: name };
    }
  }

  /** Вложение: фото — самый крупный размер по площади; стикер, место, контакт — нет. */
  private static attachment(message: TelegramMessage): Attachment | undefined {
    for (const [field, kind] of ATTACHMENT_FIELDS) {
      const file = message[field];
      if (file !== undefined) return { kind, handle: file.file_id };
    }
    let handle: string | undefined;
    let area = -1;
    for (const size of message.photo ?? []) {
      if (size.width * size.height > area) {
        area = size.width * size.height;
        handle = size.file_id;
      }
    }
    return handle === undefined ? undefined : { kind: 'image', handle };
  }

  /** Личный чат с целым положительным id. */
  private static dialog(chat: { id: number; type: string }): boolean {
    return chat.type === 'private' && chat.id > 0;
  }

  /** Собеседник и отправитель — один человек личного чата. */
  private head(chat: number): SignalHead {
    return { id: this.id, peer: String(chat), sender: String(chat) };
  }

  private static signal(signal: ConversationSignal): SignalOutcome {
    return { kind: 'signal', signal };
  }

  private static refusedPress(
    reason: UpdateRefusal,
    press: string,
  ): SignalOutcome {
    return { kind: 'refused', reason, update: 'callback_query', press };
  }

  private static refusedMessage(reason: UpdateRefusal): SignalOutcome {
    return { kind: 'refused', reason, update: 'message' };
  }
}
