import {
  type Attachment,
  type ConversationSignal,
  LINK_CODE,
  type SignalHead,
} from 'dmg-ui/chat-ui';
import * as v from 'valibot';
import {
  LINK_KEY,
  START_COMMAND,
  UNKNOWN_ENTRY,
} from '../entries/telegram-entries.const';
import { TelegramEntryTable } from '../entries/telegram-entry-table';
import { TelegramCommunitySignals } from './telegram-community-signals';
import { PressIdSchema, TelegramUpdateSchema } from './telegram-update-schema';
import {
  ATTACHMENT_FIELDS,
  BOT_COMMAND,
  COMMAND,
  COMMUNITY_UPDATES,
} from './telegram-updates.const';
import type {
  CallbackQuery,
  SignalOutcome,
  TelegramMessage,
  TelegramSignalsSpec,
  UpdateRefusal,
} from './telegram-updates.types';

const IGNORED: SignalOutcome = { kind: 'ignored' };

/**
 * Перевод апдейта Bot API в сигнал беседы или сообщества (D-UI-62) — чистый,
 * без порта и лога; экземпляр со спекой — таблицей точек входа и id бота.
 * Диалог — только личный чат, где `from.id === chat.id` > 0; поля сигнала —
 * строки. Апдейты группы — `TelegramCommunitySignals`; сообщение вне личного
 * чата — «ничего»; отвергнутое нажатие несёт свой id — ответ обязателен.
 */
export class TelegramSignals {
  private readonly table: TelegramEntryTable;
  private readonly community: TelegramCommunitySignals;

  /** Сборка: `bot` проверяет `TelegramCommunitySignals` (бросок при неверном). */
  constructor(spec: TelegramSignalsSpec) {
    this.table = new TelegramEntryTable(spec.entryPoints);
    this.community = new TelegramCommunitySignals(spec.bot);
  }

  of(update: unknown): SignalOutcome {
    const parsed = v.safeParse(TelegramUpdateSchema, update);
    if (!parsed.success) return TelegramSignals.unreadable(update);
    const { update_id, message, callback_query } = parsed.output;
    const id = String(update_id);
    if (callback_query !== undefined) return this.press(id, callback_query);
    if (message !== undefined) return this.message(id, message);
    const { my_chat_member, chat_member, chat_join_request } = parsed.output;
    if (chat_member !== undefined) {
      return this.community.member(update_id, chat_member);
    }
    if (my_chat_member !== undefined) {
      return this.community.bots(update_id, my_chat_member);
    }
    if (chat_join_request !== undefined) {
      return this.community.request(update_id, chat_join_request);
    }
    return IGNORED;
  }

  /** Апдейт не по схеме; id нажатия читается — отказ с ним; апдейт группы — с видом. */
  private static unreadable(update: unknown): SignalOutcome {
    const press = v.safeParse(PressIdSchema, update);
    if (press.success) {
      return TelegramSignals.refusedPress(
        'schema',
        press.output.callback_query.id,
      );
    }
    const community = COMMUNITY_UPDATES.find(
      (kind) =>
        typeof update === 'object' &&
        update !== null &&
        Object.hasOwn(update, kind) &&
        typeof (update as Record<string, unknown>)[kind] === 'object',
    );
    return community === undefined
      ? { kind: 'refused', reason: 'schema' }
      : { kind: 'refused', reason: 'schema', update: community };
  }

  private press(id: string, query: CallbackQuery): SignalOutcome {
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
    const head = TelegramSignals.head(id, chat.id);
    return TelegramSignals.signal({
      ...head,
      kind: 'press',
      ref: query.data,
      press: query.id,
    });
  }

  private message(id: string, message: TelegramMessage): SignalOutcome {
    const { chat, from } = message;
    if (chat.type !== 'private') return IGNORED;
    if (!TelegramSignals.dialog(chat)) {
      return TelegramSignals.refusedMessage('chat');
    }
    if (from === undefined || from.id !== chat.id) {
      return TelegramSignals.refusedMessage('sender');
    }
    const head = TelegramSignals.head(id, chat.id);
    if (message.text !== undefined) {
      return TelegramSignals.signal(
        this.command(head, message) ?? {
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
   * Текст, начинающийся сущностью `bot_command`. Имя — в нижнем регистре;
   * `cancel`, `back`, `help` и `link` — сигналы беседы раньше таблицы
   * (TG-04). Прочее — вход (`entered`). Иначе `undefined` — обычный текст.
   */
  private command(
    head: SignalHead,
    message: TelegramMessage,
  ): ConversationSignal | undefined {
    const text = message.text ?? '';
    const entity = message.entities?.find(
      (one) => one.type === BOT_COMMAND && one.offset === 0,
    );
    if (entity === undefined) return undefined;
    const name = COMMAND.exec(text.slice(0, entity.length))?.[1]?.toLowerCase();
    if (name === undefined) return undefined;
    switch (name) {
      case 'cancel':
        return { ...head, kind: 'cancel' };
      case 'back':
        return { ...head, kind: 'back' };
      case 'help':
        return { ...head, kind: 'help' };
      case 'link':
        return { ...head, kind: 'link' };
      default:
        return this.entered(head, name, text.slice(entity.length).trim());
    }
  }

  /**
   * Вход по команде (D-UI-64, D-UI-127). `/start <параметр>`: параметр среди
   * ключей `link` — вход той точки; иначе параметр по `LINK_CODE` — код
   * ссылки в `param` входа точки `/start`; иначе — как `/start`. Прочее — вход
   * точки `command`/`menu` с этим именем, нет такой — заглушка без параметра
   * (скажет беседа). Параметр не по формату в сигнал не идёт.
   */
  private entered(
    head: SignalHead,
    name: string,
    param: string,
  ): ConversationSignal {
    const start = name === START_COMMAND;
    const linked =
      start && LINK_KEY.test(param) ? this.table.link(param) : undefined;
    if (linked !== undefined) return { ...head, kind: 'enter', entry: linked };
    const entry = this.table.command(name);
    if (entry === undefined) {
      return { ...head, kind: 'enter', entry: UNKNOWN_ENTRY };
    }
    return start && LINK_CODE.test(param)
      ? { ...head, kind: 'enter', entry, param }
      : { ...head, kind: 'enter', entry };
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

  /** Собеседник и отправитель — один человек личного чата; `id` — `update_id` апдейта строкой. */
  private static head(id: string, chat: number): SignalHead {
    return { id, peer: String(chat), sender: String(chat) };
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
