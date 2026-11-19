import * as v from 'valibot';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import type {
  MessageHandle,
  MessengerPort,
  SendOptions,
} from '../messenger/messenger.types';
import { CONVERSATION_TEXTS } from './conversation.const';
import type {
  ConversationSignal,
  ConversationTextOverrides,
  LiveScreenJson,
  PlaceJson,
  Serial,
} from './conversation.types';
import type { ConversationLog } from './conversation-log';
import type { ConversationReplies } from './conversation-replies';
import { PlaceMessageSchema } from './conversation-snapshot';
import { Sha256 } from './sha256';

/** Части беседы, через которые идёт отправка. */
type OutputParts = {
  readonly messenger: MessengerPort;
  readonly peer: string;
  readonly replies: ConversationReplies;
  readonly log: ConversationLog;
  /** Замена текстов устаревшей кнопки собеседнику. */
  readonly texts?: ConversationTextOverrides;
};

/** Доставленное сообщение показа: handle и сообщение со ссылками. */
type Placed = { readonly handle: MessageHandle; readonly message: Message };

/**
 * Отправка беседы (D-UI-51, D-UI-52): живое место — сообщения последнего
 * показа вида или шага, положение (место последнее в беседе), след в
 * истории по ключу. Показ правит место на месте или уводит прежнее
 * (`retire` с нажатым) и шлёт новыми; заметки и реакции на нажатие — вне места.
 * @see conversation-show.test.ts
 */
export class ConversationOutput {
  private handles: readonly MessageHandle[];
  private message: Message | undefined;
  private history: string | undefined;
  /** Номер экрана, чей вид со следом показывает место. */
  private owner: Serial | undefined;
  private latest: boolean;
  /** Сигнал собеседника не нажатие: положение сбивается до первого показа или с концом сигнала. */
  private knocking = false;
  /** Ссылка нажатия текущего сигнала; сигнал не нажатие — нет. */
  private press: string | undefined;
  /** Текст ответа на нажатие, который дала реакция. */
  private reply: string | undefined;

  constructor(
    private readonly parts: OutputParts,
    screen?: LiveScreenJson,
  ) {
    this.handles = screen?.handles ?? [];
    this.message = screen?.message;
    this.history = screen?.history;
    this.owner = screen?.history === undefined ? undefined : screen.serial;
    this.latest = screen?.latest === true;
  }

  /** Начало сигнала: `press` — ссылка нажатого и сбор текста ответа; иное сбивает положение. */
  begin(signal: ConversationSignal): void {
    this.reply = undefined;
    this.press = signal.kind === 'press' ? signal.ref : undefined;
    this.knocking = signal.kind !== 'press';
  }

  /** Конец сигнала: текст ответа на нажатие, если реакция его дала; сигнал не исполнен (`done` ложно) — место прежнее, текста нет. */
  end(done: boolean): string | undefined {
    if (done) this.knocked();
    const reply = done ? this.reply : undefined;
    this.knocking = false;
    this.press = undefined;
    this.reply = undefined;
    return reply;
  }

  /** Вид живого экрана `screen` в место; `key` — ключ следа в истории как его дало представление. */
  async view(
    screen: Serial,
    messages: readonly Message[],
    key: string | undefined,
    send?: SendOptions,
  ): Promise<void> {
    const history = key === undefined ? undefined : await Sha256.hex(key);
    const kept =
      this.history === undefined ||
      (this.owner === screen && this.history === history);
    if (!(await this.place(messages, kept, send))) return;
    this.history = history;
    this.owner = history === undefined ? undefined : screen;
  }

  /** Шаг живого экрана (вопрос поля, подтверждение) в место; ключа истории нет. */
  async step(message: Message): Promise<void> {
    if (!(await this.place([message], this.history === undefined))) return;
    this.history = undefined;
    this.owner = undefined;
  }

  /** Заметка — новое сообщение вне места; доставлена — положение сбито. */
  async note(text: string): Promise<void> {
    this.knocked();
    if ((await this.show(this.parts.replies.note(text))) !== undefined) {
      this.latest = false;
    }
  }

  /** Реакция на нажатие: у мессенджера с ответом на нажатие — текст ответа, иначе заметка. */
  async react(text: string): Promise<void> {
    const { pressAnswer } = this.parts.messenger.capabilities;
    if (this.press !== undefined && pressAnswer !== undefined) {
      this.reply = text;
      return;
    }
    await this.note(text);
  }

  /** Нажатие по закрытому экрану: ответ «кнопка устарела» (текст может заменить приложение). */
  async closed(): Promise<void> {
    await this.react(this.parts.texts?.closed ?? CONVERSATION_TEXTS.closed);
  }

  /** Нажатие по неизвестной ссылке: ответ «кнопка устарела» (текст может заменить приложение). */
  async unknownRef(): Promise<void> {
    await this.react(
      this.parts.texts?.unknownRef ?? CONVERSATION_TEXTS.unknownRef,
    );
  }

  /**
   * Место освобождено: живой экран отдан приёмнику вне беседы (D-UI-90).
   * Прежнее последнее сообщение уходит с нажатым; положение сбито — следующий
   * показ идёт новым сообщением под показом приёмника, погашенное не правится.
   */
  async release(): Promise<void> {
    await this.retire();
    this.handles = [];
    this.message = undefined;
    this.history = undefined;
    this.owner = undefined;
    this.latest = false;
  }

  /** Положение сбито извне (уведомление). */
  knock(): void {
    this.latest = false;
  }

  /**
   * Место — для снимка (поля `LiveScreenJson`). Сообщение сверх пределов
   * схемы в снимок не идёт: снимок пишется без него, после перезапуска уход
   * прежнего сообщения (`retire`) пропускается.
   */
  toJSON(): PlaceJson {
    const { history } = this;
    const message = v.is(PlaceMessageSchema, this.message)
      ? this.message
      : undefined;
    return {
      handles: [...this.handles],
      ...(this.latest ? { latest: true } : {}),
      ...(history === undefined ? {} : { history }),
      ...(message === undefined ? {} : { message }),
    };
  }

  /**
   * Показ в место: на месте, если место последнее, не защищено следом
   * (`kept`) и число сообщений совпало (вид пока один — `text`); иначе новыми.
   * Не доставлено ни одно — место прежнее: следующий показ поправит его и
   * вернёт варианты. Пустые в порт не уходят. Место сменилось — true.
   */
  private async place(
    all: readonly Message[],
    kept: boolean,
    send?: SendOptions,
  ): Promise<boolean> {
    this.knocked();
    const messages = all.filter((m) => !ConversationOutput.blank(m));
    if (messages.length === 0) return false;
    const targets = kept && this.latest ? this.targets(messages) : undefined;
    const placed =
      targets === undefined
        ? await this.renew(messages, send)
        : await this.update(targets, send);
    if (placed === undefined || placed.length === 0) return false;
    this.handles = placed.map((p) => p.handle);
    this.message = placed.at(-1)?.message;
    this.latest = true;
    return true;
  }

  /** Сообщения места в пару к новым — когда их столько же; иначе `undefined`. */
  private targets(messages: readonly Message[]): readonly Placed[] | undefined {
    if (this.handles.length !== messages.length) return undefined;
    const targets: Placed[] = [];
    for (const [i, handle] of this.handles.entries()) {
      const message = messages[i];
      if (message === undefined) return undefined;
      targets.push({ handle, message });
    }
    return targets;
  }

  /** Правка по порядку; первое новое (`edited: false`) — прежнее последнее уходит, остальные новыми. Недоставка — место прежнее. */
  private async update(
    targets: readonly Placed[],
    send?: SendOptions,
  ): Promise<readonly Placed[] | undefined> {
    const { messenger, peer, log } = this.parts;
    const placed: Placed[] = [];
    for (const [i, { handle, message }] of targets.entries()) {
      const updated = await messenger.update(peer, handle, message, send);
      if (!updated.ok) {
        log.undelivered('update', updated.error.reason);
        return undefined;
      }
      placed.push({ handle: updated.value.handle, message });
      if (!updated.value.edited) {
        await this.retire();
        const rest = targets.slice(i + 1).map((t) => t.message);
        return [...placed, ...(await this.shown(rest, send))];
      }
    }
    return placed;
  }

  /** Новыми: прежнее последнее сообщение места уходит, затем каждое — `show`. */
  private async renew(
    messages: readonly Message[],
    send?: SendOptions,
  ): Promise<readonly Placed[]> {
    await this.retire();
    return this.shown(messages, send);
  }

  /** Новые сообщения по порядку; доставленные. */
  private async shown(
    messages: readonly Message[],
    send?: SendOptions,
  ): Promise<readonly Placed[]> {
    const placed: Placed[] = [];
    for (const message of messages) {
      const handle = await this.show(message, send);
      if (handle !== undefined) placed.push({ handle, message });
    }
    return placed;
  }

  /** Новое сообщение; пустое в порт не уходит, недоставка — `warn` без данных. */
  private async show(
    message: Message,
    send?: SendOptions,
  ): Promise<MessageHandle | undefined> {
    if (ConversationOutput.blank(message)) return undefined;
    const { messenger, peer, log } = this.parts;
    const delivery = await messenger.show(peer, message, send);
    if (delivery.ok) return delivery.value;
    log.undelivered('show', delivery.error.reason);
    return undefined;
  }

  /** Прежнее последнее сообщение места с вариантами уходит; `chosen` — нажатое, если оно из его вариантов. */
  private async retire(): Promise<void> {
    const { message, press } = this;
    const handle = this.handles.at(-1);
    if (message === undefined || handle === undefined) return;
    if (message.options.length === 0) return;
    const { messenger, peer, log } = this.parts;
    const chosen = message.options.some((o) => o.ref === press)
      ? press
      : undefined;
    const retired = await messenger.retire(peer, handle, message, chosen);
    if (!retired.ok) log.undelivered('retire', retired.error.reason);
  }

  /** Сигнал собеседника сбил положение: применяется с первым показом сигнала. */
  private knocked(): void {
    if (!this.knocking) return;
    this.knocking = false;
    this.latest = false;
  }

  private static blank(message: Message): boolean {
    return message.options.length === 0 && PlainText.of(message.text) === '';
  }
}
