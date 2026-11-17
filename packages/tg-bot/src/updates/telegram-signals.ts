import type {
  Attachment,
  ConversationSignal,
  SignalHead,
} from 'dmg-ui/chat-ui';
import * as v from 'valibot';
import {
  START_COMMAND,
  UNKNOWN_ENTRY,
} from '../entries/telegram-entries.const';
import { TelegramEntryTable } from '../entries/telegram-entry-table';
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
  TelegramSignalsSpec,
  UpdateRefusal,
} from './telegram-updates.types';

const IGNORED: SignalOutcome = { kind: 'ignored' };

/**
 * Перевод апдейта Bot API в сигнал беседы (D-UI-62, D-UI-64) — чистый, без
 * порта и лога; экземпляр со спекой — таблицей точек входа и id бота. Диалог — только личный чат, где отправитель и собеседник — один
 * человек: `chat.type === 'private'`, целое `chat.id` > 0, `from.id ===
 * chat.id`. Поля сигнала — строки: `id` — `update_id`, `peer` — `chat.id`,
 * `sender` — `from.id`. Сообщение вне личного чата и прочие виды апдейтов —
 * «ничего»; отвергнутое нажатие несёт свой id — ответ обязателен.
 */
export class TelegramSignals {
  private readonly table: TelegramEntryTable;

  /** Сборка: `bot` — безопасное целое > 0, иначе бросок (нужен приёму сообщества для отсева эха). */
  constructor(spec: TelegramSignalsSpec) {
    if (!Number.isSafeInteger(spec.bot) || spec.bot <= 0) {
      throw new Error('TelegramSignals: bot — безопасное целое больше нуля');
    }
    this.table = new TelegramEntryTable(spec.entryPoints);
  }

  of(update: unknown): SignalOutcome {
    const parsed = v.safeParse(TelegramUpdateSchema, update);
    if (!parsed.success) return TelegramSignals.unreadable(update);
    const { update_id, message, callback_query } = parsed.output;
    const id = String(update_id);
    if (callback_query !== undefined) return this.press(id, callback_query);
    if (message !== undefined) return this.message(id, message);
    return IGNORED;
  }

  /** Апдейт не по схеме; id нажатия читается — отказ с ним. */
  private static unreadable(update: unknown): SignalOutcome {
    const press = v.safeParse(PressIdSchema, update);
    return press.success
      ? TelegramSignals.refusedPress('schema', press.output.callback_query.id)
      : { kind: 'refused', reason: 'schema' };
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
   * `cancel` и `back` — раньше таблицы. `/start <параметр>`: параметр в
   * формате и среди ключей `link` — вход той точки, иначе — как `/start`.
   * Прочее — вход точки `command`/`menu` с этим именем, нет такой —
   * заглушка (скажет беседа). Параметр в сигнал не идёт. Иначе `undefined` —
   * обычный текст.
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
      default:
        return {
          ...head,
          kind: 'enter',
          entry: this.entry(name, text.slice(entity.length).trim()),
        };
    }
  }

  /** Вход по команде и параметру `/start`; нет в таблице — заглушка. */
  private entry(name: string, param: string): string {
    const linked =
      name === START_COMMAND && START_PARAM.test(param)
        ? this.table.link(param)
        : undefined;
    return linked ?? this.table.command(name) ?? UNKNOWN_ENTRY;
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
