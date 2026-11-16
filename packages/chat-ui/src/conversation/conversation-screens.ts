import type { Trace } from 'dmg-core';
import {
  type Address,
  AddressCodec,
  type AddressJson,
  type InstanceJson,
  type ScreenInstance,
} from 'dmg-ui';
import { DIALOG_TEXTS } from '../dialog/dialog-replies';
import type { Message } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import type { MessageHandle, SendOptions } from '../messenger/messenger.types';
import { MAX_HANDLES } from './conversation.const';
import type {
  ConversationSpec,
  LiveScreenJson,
  Serial,
} from './conversation.types';
import type { ConversationLog } from './conversation-log';
import type { ConversationReplies } from './conversation-replies';
import type { RefTable } from './ref-table';
import { ScreenFingerprint } from './screen-fingerprint';

/** Живой экран беседы: номер, экземпляр ядра, отпечаток показанного и его сообщения. */
type LiveScreen = {
  readonly serial: Serial;
  readonly instance: ScreenInstance;
  readonly unlisten: () => void;
  shown: string;
  handles: MessageHandle[];
  page: number;
};

/** Показанное живого экрана: отпечаток, сообщения, страница вариантов. */
type ShownState = {
  readonly shown: string;
  readonly handles: readonly MessageHandle[];
  readonly page: number;
};

/** Части беседы, на которых работает живой экран. */
type ScreensParts = {
  readonly spec: ConversationSpec;
  readonly replies: ConversationReplies;
  readonly refs: RefTable;
  readonly log: ConversationLog;
  /** Экземпляр перечитан по событию: беседа ставит показ в свою очередь. */
  readonly refreshed: (instance: ScreenInstance) => void;
};

/**
 * Живой экран беседы (D-UI-46): открытие и восстановление экземпляра ядра,
 * показ вида и заметок новым сообщением, номера экранов. Экран снимка
 * поднимается лениво, на первом сигнале: отпечаток вида совпал с показанным —
 * ссылки экрана переходят на ревизию восстановленного экземпляра.
 */
export class ConversationScreens {
  private readonly parts: ScreensParts;
  private readonly codec: AddressCodec;
  private live: LiveScreen | undefined;
  private pending: LiveScreenJson | undefined;
  private serial: Serial;

  constructor(parts: ScreensParts, serial: Serial, pending?: LiveScreenJson) {
    this.parts = parts;
    this.codec = new AddressCodec(parts.spec.app.set);
    this.serial = serial;
    this.pending = pending;
  }

  /** Номер и экземпляр живого экрана; экрана нет — `undefined`. */
  current():
    | { readonly serial: Serial; readonly instance: ScreenInstance }
    | undefined {
    return this.live;
  }

  /** Последний выданный номер экрана. */
  last(): Serial {
    return this.serial;
  }

  /** Экран снимка — через `restore` ядра и отпечаток; нет снимка — true, не восстановлен — заметка и false. */
  async wake(trace: Trace): Promise<boolean> {
    const pending = this.pending;
    if (pending === undefined) return true;
    this.pending = undefined;
    const restored = await this.restore(pending.instance, trace);
    if (restored === undefined) {
      await this.note(DIALOG_TEXTS.notRestored);
      return false;
    }
    const view = restored.view();
    const shown = await ScreenFingerprint.of(this.parts.replies.shown(view));
    if (shown === pending.shown) {
      this.parts.refs.rebase(pending.serial, view.revision - 1, view.revision);
    }
    this.attach(restored, pending.serial, pending);
    return true;
  }

  /** Экран из снимка экземпляра (внешние данные); отказ — заметка и вход home. */
  async resume(json: unknown, trace: Trace): Promise<void> {
    const restored = await this.restore(json, trace);
    if (restored === undefined) {
      await this.note(DIALOG_TEXTS.notRestored);
      await this.home(trace);
      return;
    }
    this.replace(restored);
    await this.show();
  }

  /** Адрес из внешних данных (исход `moved`, ссылка): не декодирован — заметка и вход home. */
  async openJson(json: AddressJson, trace: Trace): Promise<void> {
    const address = this.codec.decode(json);
    if (!address.ok) {
      await this.note(DIALOG_TEXTS.notRestored);
      await this.home(trace);
      return;
    }
    await this.open(address.value, trace);
  }

  /** Вход «в начало». */
  async home(trace: Trace): Promise<void> {
    const { app, home } = this.parts.spec;
    const entry = app.entries[home];
    if (entry === undefined) {
      throw new Error(
        `Conversation: у приложения ${app.name} нет входа ${home}`,
      );
    }
    await this.open(entry.address, trace);
  }

  async open(address: Address, trace: Trace): Promise<void> {
    const { runtime, contexts } = this.parts.spec;
    const instance = await runtime.open(address, {
      context: await contexts.context(trace),
      trace: trace.toJSON(),
    });
    this.replace(instance);
    await this.show();
  }

  /** Вид живого экрана новым сообщением; `lead` — заметка перед видом. */
  async show(lead?: string, send?: SendOptions): Promise<void> {
    const live = this.live;
    if (live === undefined) return;
    const reply = this.parts.replies.screen(
      live.instance.view(),
      live.serial,
      lead,
    );
    live.shown = await ScreenFingerprint.of(reply.shown);
    const handle = await this.send(reply.message, send);
    if (handle === undefined) return;
    live.handles = [...live.handles, handle].slice(-MAX_HANDLES);
  }

  /** Перечитанный экземпляр ещё живой — его вид по инициативе. */
  async refreshed(instance: ScreenInstance): Promise<void> {
    if (this.live?.instance !== instance) return;
    await this.show(undefined, { initiative: true });
  }

  async note(text: string): Promise<void> {
    await this.send(this.parts.replies.note(text));
  }

  /** Новое сообщение; пустое в порт не уходит, недоставка — `warn` без данных. */
  async send(
    message: Message,
    send?: SendOptions,
  ): Promise<MessageHandle | undefined> {
    if (message.options.length === 0 && PlainText.of(message.text) === '') {
      return undefined;
    }
    const { messenger, peer } = this.parts.spec;
    const delivery = await messenger.show(peer, message, send);
    if (delivery.ok) return delivery.value;
    this.parts.log.undelivered('show', delivery.error.reason);
    return undefined;
  }

  /** Снимок экземпляра живого экрана. */
  instance(): InstanceJson | undefined {
    return this.live?.instance.snapshot();
  }

  /** Для снимка беседы: живой экран или ещё не поднятый экран снимка. */
  toJSON(): LiveScreenJson | undefined {
    const live = this.live;
    if (live === undefined) return this.pending;
    return {
      serial: live.serial,
      instance: live.instance.snapshot(),
      shown: live.shown,
      handles: [...live.handles],
      page: live.page,
    };
  }

  /** Подписка снята, экземпляр закрыт. */
  close(): void {
    this.detach();
  }

  private async restore(
    json: unknown,
    trace: Trace,
  ): Promise<ScreenInstance | undefined> {
    const { runtime, contexts } = this.parts.spec;
    const restored = await runtime.restore(json, {
      context: await contexts.context(trace),
      trace: trace.toJSON(),
    });
    return restored.ok ? restored.value : undefined;
  }

  /** Новый живой экран со следующим номером; прежний закрыт. */
  private replace(instance: ScreenInstance): void {
    this.serial += 1;
    this.attach(instance, this.serial, { shown: '', handles: [], page: 0 });
  }

  private attach(
    instance: ScreenInstance,
    serial: Serial,
    from: ShownState,
  ): void {
    this.detach();
    // Проактивный показ — только на перечитывание: на `acted` и `local`
    // показ даёт сам обработчик сигнала.
    const unlisten = instance.onChange((change) => {
      if (change.cause === 'refreshed') this.parts.refreshed(instance);
    });
    this.live = {
      serial,
      instance,
      unlisten,
      shown: from.shown,
      handles: [...from.handles],
      page: from.page,
    };
  }

  private detach(): void {
    const live = this.live;
    this.live = undefined;
    live?.unlisten();
    live?.instance.close();
  }
}
