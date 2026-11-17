import type { Trace } from 'dmg-core';
import {
  type Address,
  AddressCodec,
  type AddressJson,
  type InstanceJson,
  type InstanceView,
  type ScreenInstance,
} from 'dmg-ui';
import type { SendOptions } from '../messenger/messenger.types';
import type { ComposedScreen, ScreenComposer } from '../view/screen-composer';
import { CONVERSATION_TEXTS } from './conversation.const';
import type {
  ConversationSpec,
  LiveScreenJson,
  Serial,
} from './conversation.types';
import type { ConversationOutput } from './conversation-output';
import type { ConversationPath } from './conversation-path';
import type { ConversationReplies } from './conversation-replies';
import type { RefTable } from './ref-table';
import { ScreenFingerprint } from './screen-fingerprint';

/** Живой экран беседы: номер, экземпляр ядра, отпечаток показанного и страница вариантов. */
type LiveScreen = {
  readonly serial: Serial;
  readonly instance: ScreenInstance;
  readonly unlisten: () => void;
  shown: string;
  page: number;
};

/** Показанное живого экрана: отпечаток и страница вариантов. */
type ShownState = {
  readonly shown: string;
  readonly page: number;
};

/** Части беседы, на которых работает живой экран. */
type ScreensParts = {
  readonly spec: ConversationSpec;
  /** Вид → показ представления; «Назад» в вариантах — когда путь не пуст. */
  readonly composer: ScreenComposer;
  /** Путь переходов беседы: экраны решают, когда он растёт, снимается и сбрасывается. */
  readonly path: ConversationPath;
  readonly replies: ConversationReplies;
  /** Живое место: показ вида, заметки, реакции на нажатие. */
  readonly output: ConversationOutput;
  readonly refs: RefTable;
  /** Экземпляр перечитан по событию: беседа ставит показ в свою очередь. */
  readonly refreshed: (instance: ScreenInstance) => void;
  /** Вид экрана снимка совпал с показанным: ревизия `to` вместо прежней — для черновика беседы. */
  readonly rebased: (serial: Serial, from: number, to: number) => void;
};

/**
 * Живой экран беседы (D-UI-46): открытие и восстановление экземпляра ядра,
 * путь переходов и «Назад», сборка показа вида в живое место, номера
 * экранов. Экран снимка поднимается лениво, на первом сигнале: отпечаток вида
 * совпал с показанным — ссылки экрана переходят на ревизию восстановленного.
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

  /** Живой экран с номером `serial`; чужой — «Экран уже закрыт.», ядро не вызывается. */
  async onScreen(
    serial: Serial,
  ): Promise<
    { readonly serial: Serial; readonly instance: ScreenInstance } | undefined
  > {
    const live = this.live;
    if (live !== undefined && live.serial === serial) return live;
    await this.parts.output.react(CONVERSATION_TEXTS.closed);
    return undefined;
  }

  /** Последний выданный номер экрана и черновика. */
  last(): Serial {
    return this.serial;
  }

  /** Следующий номер беседы — для черновика: экраны и черновики нумеруются одним счётчиком. */
  issue(): Serial {
    this.serial += 1;
    return this.serial;
  }

  /** Номер живого экрана или ещё не поднятого экрана снимка. */
  shownSerial(): Serial | undefined {
    return (this.live ?? this.pending)?.serial;
  }

  /** Экран снимка — через `restore` ядра и отпечаток; нет снимка — true, не восстановлен — заметка и false. */
  async wake(trace: Trace): Promise<boolean> {
    const pending = this.pending;
    if (pending === undefined) return true;
    // Бросок порта до ответа ядра экран снимка не снимает: следующий сигнал пробует снова.
    const restored = await this.restore(pending.instance, trace);
    this.pending = undefined;
    if (restored === undefined) {
      await this.parts.output.note(CONVERSATION_TEXTS.notRestored);
      return false;
    }
    const view = restored.view();
    const shown = await ScreenFingerprint.of(this.compose(view).messages);
    if (shown === pending.shown) {
      const from = view.revision - 1;
      this.parts.refs.rebase(pending.serial, from, view.revision);
      this.parts.rebased(pending.serial, from, view.revision);
    }
    this.attach(restored, pending.serial, pending);
    return true;
  }

  /** Экран из снимка экземпляра (внешние данные) вместо экрана снимка беседы; отказ — заметка и вход home. */
  async resume(json: unknown, trace: Trace): Promise<void> {
    const restored = await this.restore(json, trace);
    this.pending = undefined;
    if (restored === undefined) {
      await this.parts.output.note(CONVERSATION_TEXTS.notRestored);
      await this.home(trace);
      return;
    }
    this.parts.path.reset();
    this.replace(restored);
    await this.show();
  }

  /**
   * «Назад»: верхний элемент пути через `restore` — новый живой экран без
   * записи в путь; путь пуст — живой экран снова. Элемент снимается, когда
   * `restore` ответил: бросок порта путь не трогает. Не восстановился —
   * заметка и вход home, нижние элементы не пробуются.
   */
  async back(trace: Trace): Promise<void> {
    const { path } = this.parts;
    const step = path.top();
    if (step === undefined) {
      await this.show();
      return;
    }
    const restored = await this.restore(step, trace);
    path.pop();
    if (restored === undefined) {
      await this.parts.output.note(CONVERSATION_TEXTS.notRestored);
      await this.home(trace);
      return;
    }
    this.replace(restored);
    await this.show();
  }

  /**
   * Адрес из внешних данных (исход `moved`, ссылка): уход по пути, когда
   * экземпляр открыт, — до показа, чтобы «Назад» был в первом показе; бросок
   * порта путь не трогает. Не декодирован — заметка и вход home.
   */
  async openJson(json: AddressJson, trace: Trace): Promise<void> {
    const address = this.codec.decode(json);
    if (!address.ok) {
      await this.parts.output.note(CONVERSATION_TEXTS.notRestored);
      await this.home(trace);
      return;
    }
    const instance = await this.start(address.value, trace);
    const live = this.live;
    if (live !== undefined) {
      this.parts.path.leave(live.instance.snapshot(), json.screen);
    }
    await this.present(instance);
  }

  /** Вход приложения: путь сброшен. */
  async enter(address: Address, trace: Trace): Promise<void> {
    this.parts.path.reset();
    await this.open(address, trace);
  }

  /** Вход «в начало», путь сброшен; `lead` — текст перед видом входа (выход сторис). */
  async home(trace: Trace, lead?: string): Promise<void> {
    const { app, home } = this.parts.spec;
    const entry = app.entries[home];
    if (entry === undefined) {
      throw new Error(
        `Conversation: у приложения ${app.name} нет входа ${home}`,
      );
    }
    this.parts.path.reset();
    await this.open(entry.address, trace, lead);
  }

  /** Новый живой экран по адресу; путь не трогает — это дело вызывающего. */
  private async open(
    address: Address,
    trace: Trace,
    lead?: string,
  ): Promise<void> {
    await this.present(await this.start(address, trace), lead);
  }

  /** Экземпляр ядра по адресу; живой экран и путь не трогает. */
  private async start(address: Address, trace: Trace): Promise<ScreenInstance> {
    const { runtime, contexts } = this.parts.spec;
    return runtime.open(address, {
      context: await contexts.context(trace),
      trace: trace.toJSON(),
    });
  }

  /** Открытый экземпляр — живой экран, его вид в живое место; `lead` — заметка перед видом. */
  private async present(
    instance: ScreenInstance,
    lead?: string,
  ): Promise<void> {
    this.replace(instance);
    await this.show(lead);
  }

  /** Вид живого экрана в живое место; `lead` — заметка перед видом. */
  async show(lead?: string, send?: SendOptions): Promise<void> {
    const live = this.live;
    if (live === undefined) return;
    const view = live.instance.view();
    const composed = this.compose(view);
    const messages = this.parts.replies.screen(
      composed,
      view,
      live.serial,
      lead,
      live.page,
    );
    live.shown = await ScreenFingerprint.of(composed.messages);
    await this.parts.output.view(live.serial, messages, composed.history, send);
  }

  /** Страница вариантов живого экрана `serial` («Ещё»); чужой экран — «Экран уже закрыт.». */
  async turn(serial: Serial, page: number): Promise<void> {
    const live = this.live;
    if (live === undefined || live.serial !== serial) {
      await this.parts.output.react(CONVERSATION_TEXTS.closed);
      return;
    }
    live.page = page;
    await this.show();
  }

  /** Перечитанный экземпляр ещё живой — его вид по инициативе. */
  async refreshed(instance: ScreenInstance): Promise<void> {
    if (this.live?.instance !== instance) return;
    await this.show(undefined, { initiative: true });
  }

  /** Снимок экземпляра живого экрана. */
  instance(): InstanceJson | undefined {
    return this.live?.instance.snapshot();
  }

  /** Для снимка беседы: живой экран или ещё не поднятый экран снимка; место — от живого места. */
  toJSON(): LiveScreenJson | undefined {
    const live = this.live;
    const place = this.parts.output.toJSON();
    if (live === undefined) {
      const pending = this.pending;
      if (pending === undefined) return undefined;
      const { serial, instance, shown, page } = pending;
      return { serial, instance, shown, page, ...place };
    }
    return {
      serial: live.serial,
      instance: live.instance.snapshot(),
      shown: live.shown,
      page: live.page,
      ...place,
    };
  }

  /** Подписка снята, экземпляр закрыт. */
  close(): void {
    this.detach();
  }

  /** Показ вида сборщиком; «Назад» — когда путь не пуст (отпечаток — с ним). */
  private compose(view: InstanceView): ComposedScreen {
    return this.parts.composer.compose(view, !this.parts.path.empty());
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
    this.attach(instance, this.issue(), { shown: '', page: 0 });
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
