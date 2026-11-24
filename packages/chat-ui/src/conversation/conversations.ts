import { type Identified, Trace } from 'dmg-core';
import { ScreenRuntime, UiIds } from 'dmg-ui';
import {
  type DeliveredNotification,
  type NotificationDelivery,
  RenderContexts,
} from 'dmg-ui/server';
import * as v from 'valibot';
import type { Message } from '../message/message.types';
import { TextBuilder } from '../message/text-builder';
import { LimitedMessenger } from '../messenger/limited-messenger';
import { Conversation } from './conversation';
import {
  CONVERSATION_HOME,
  CONVERSATION_LIMIT,
  CONVERSATION_TEXTS,
} from './conversation.const';
import type {
  ConversationSignal,
  ConversationSnapshot,
  ConversationsSpec,
  SignalTraces,
} from './conversation.types';
import { ConversationLog } from './conversation-log';
import { ConversationSnapshotSchema } from './conversation-snapshot';
import { PeerQueues } from './peer-queues';
import { RefEpochs } from './ref-epochs';

/** Беседа в памяти узла: владелец, беседа и закрытие её сессии сервера. */
type Hosted = {
  readonly person: string;
  readonly conversation: Conversation;
  readonly close: () => void;
};

/** Снимок из хранилища: прочитан (его может не быть) или чтение сорвалось. */
type Loaded =
  | { readonly ok: true; readonly snapshot: ConversationSnapshot | undefined }
  | { readonly ok: false };

/** Заметка собеседнику, когда хранилище не прочиталось. */
const LATER: Message = {
  kind: 'text',
  text: TextBuilder.of(CONVERSATION_TEXTS.later),
  options: [],
};

/**
 * Узел бесед одного приложения мессенджера (D-UI-43): принимает сигналы
 * (`receive`) и уведомления (`deliver`). Личность отправителя — порт `people`,
 * собеседник получателя — порт `peers`; беседа — в памяти или из хранилища по
 * схеме снимка. Снимок пишется после сигнала, уведомления и проактивного
 * показа; давняя беседа сверх предела выгружается. Входы не бросают
 * (ERR-01), лог без данных (ERR-07).
 */
export class Conversations<U extends Identified>
  implements NotificationDelivery
{
  private readonly spec: ConversationsSpec<U>;
  private readonly messenger: LimitedMessenger;
  private readonly log: ConversationLog;
  private readonly contexts: RenderContexts<U>;
  private readonly traces: SignalTraces;
  private readonly home: string;
  private readonly limit: number;
  private readonly epochs: () => string;
  private readonly hosted = new Map<string, Hosted>();
  private readonly ids: UiIds;
  private readonly lines = new PeerQueues();

  /**
   * Нет входа home, возможности не годятся, сборка представлений или кода не
   * этого приложения — бросок при сборке.
   */
  constructor(spec: ConversationsSpec<U>) {
    const { app, views, codes } = spec;
    if (views.app !== app) {
      throw new Error(
        `Conversations: представления ${views.scopeName()}, а беседы — приложения ${app.name}`,
      );
    }
    if (codes.app !== app) {
      throw new Error(
        `Conversations: загрузчики кода ${codes.scopeName()}, а беседы — приложения ${app.name}`,
      );
    }
    this.messenger = new LimitedMessenger({
      port: spec.messenger,
      logger: spec.logger,
    });
    this.home = spec.home ?? CONVERSATION_HOME;
    Conversation.assertFits(app, this.home, this.messenger.capabilities);
    this.spec = spec;
    this.ids = new UiIds(app.set);
    this.log = new ConversationLog(
      spec.logger,
      this.messenger.capabilities.name,
    );
    this.contexts = new RenderContexts(spec.callers, spec.places);
    const requestIds = spec.requestIds ?? (() => crypto.randomUUID());
    this.traces = {
      next: () =>
        Trace.fromRequest({
          requestId: requestIds(),
          channel: { name: app.channel },
        }),
    };
    this.limit = spec.limit ?? CONVERSATION_LIMIT;
    this.epochs = spec.epochs ?? RefEpochs.random;
  }

  /** Внешний вход: не бросает (ERR-01). Обещание — после обработки и сохранения снимка. */
  async receive(signal: ConversationSignal): Promise<void> {
    try {
      const reason = Conversation.rejects(signal);
      if (reason !== undefined) {
        this.log.rejected(signal.kind, reason);
        await this.answer(signal);
        return;
      }
      try {
        await this.lines.run(signal.peer, () => this.handle(signal));
      } finally {
        await this.unload(signal.peer);
      }
    } catch (error) {
      this.log.defect({ kind: signal.kind }, error);
    }
  }

  /**
   * Уведомление получателю: беседа собеседника из `peers`, дошедшее
   * пишется в снимок. Внешний вход: не бросает (ERR-01), лог без данных (ERR-07).
   */
  async deliver(notification: DeliveredNotification): Promise<void> {
    try {
      if (this.ids.findNotification(notification.notification) === undefined) {
        this.log.noNotification();
        return;
      }
      const peer = await this.spec.peers(notification.recipient);
      if (peer === undefined || !Conversation.fitsPeer(peer)) {
        this.log.noPeer();
        return;
      }
      try {
        await this.lines.run(peer, () => this.notify(peer, notification));
      } finally {
        await this.unload(peer);
      }
    } catch (error) {
      this.log.defect({ operation: 'notify' }, error);
    }
  }

  /** Все беседы в памяти отработали очередь, снимки после проактивных показов записаны. */
  async settled(): Promise<void> {
    await this.lines.idle();
    await Promise.all(
      [...this.hosted.values()].map((hosted) => hosted.conversation.settled()),
    );
    // Проактивный показ ставит запись снимка в очередь собеседника.
    await this.lines.idle();
  }

  /** Снимки сохранены, подписки сняты, беседы выгружены. */
  async close(): Promise<void> {
    await this.lines.idle();
    await Promise.all(
      [...this.hosted].map(([peer, hosted]) => this.evict(peer, hosted)),
    );
  }

  /** Личность, беседа, исполнение и снимок — в очереди собеседника. */
  private async handle(signal: ConversationSignal): Promise<void> {
    let hosted: Hosted | undefined;
    try {
      hosted = await this.admit(signal);
    } catch (error) {
      // Бросок порта `people` или сборки беседы — дефект; нажатию всё равно ответ.
      this.log.defect({ kind: signal.kind }, error);
      await this.answer(signal);
      return;
    }
    if (hosted === undefined) return;
    let accepted = true;
    try {
      accepted = await hosted.conversation.receive(signal);
    } catch (error) {
      // Дефект беседы: отсев и состояние в памяти всё равно идут в снимок.
      this.log.defect({ kind: signal.kind }, error);
    }
    if (accepted) await this.save(signal.peer, hosted.conversation);
  }

  /** Уведомление беседе собеседника, в его очереди; не дошло, чужая личность или хранилище не прочиталось — снимок не пишется. */
  private async notify(
    peer: string,
    notification: DeliveredNotification,
  ): Promise<void> {
    const hosted = await this.host(peer, notification.recipient);
    if (hosted === 'foreign') {
      // Чужая беседа по `peers`: снимок прежний.
      this.log.noticeForeign();
      return;
    }
    if (hosted === 'unread') return;
    if (await hosted.conversation.notify(notification)) {
      await this.save(peer, hosted.conversation);
    }
  }

  /** Беседа сигнала; сигнал не исполняется — отказ записан и отвечен, `undefined`. */
  private async admit(signal: ConversationSignal): Promise<Hosted | undefined> {
    const uuid = await this.spec.people(signal.sender);
    if (uuid === undefined) {
      this.log.refused(signal.kind, CONVERSATION_TEXTS.noPerson);
      await this.answer(signal);
      return undefined;
    }
    const hosted = await this.host(signal.peer, uuid);
    if (hosted === 'foreign') {
      // Чужая личность беседу не трогает: снимок прежний.
      this.log.refused(signal.kind, CONVERSATION_TEXTS.foreign);
      await this.answer(signal);
      return undefined;
    }
    if (hosted === 'unread') {
      // Беседы нет и снимок не пишется: следующий сигнал читает хранилище заново.
      await this.later(signal);
      return undefined;
    }
    return hosted;
  }

  /** Беседа собеседника из памяти или из хранилища; владелец не `uuid` — `foreign`, хранилище не прочиталось — `unread`. */
  private async host(
    peer: string,
    uuid: string,
  ): Promise<Hosted | 'foreign' | 'unread'> {
    const known = this.hosted.get(peer);
    if (known !== undefined) {
      if (known.person !== uuid) return 'foreign';
      // Порядок карты — давность: тронутая встаёт в конец.
      this.hosted.delete(peer);
      this.hosted.set(peer, known);
      return known;
    }
    const loaded = await this.load(peer);
    if (!loaded.ok) return 'unread';
    const { snapshot } = loaded;
    if (snapshot !== undefined && snapshot.person !== uuid) return 'foreign';
    const hosted = this.build(peer, uuid, snapshot);
    this.hosted.set(peer, hosted);
    return hosted;
  }

  /** Снимок по схеме; нет или мусор — без снимка (беседа заново); сбой чтения — `ok: false`. */
  private async load(peer: string): Promise<Loaded> {
    let raw: unknown;
    try {
      raw = await this.spec.store.load(peer);
    } catch (error) {
      this.log.storeFailed('load', error);
      return { ok: false };
    }
    if (raw === undefined) return { ok: true, snapshot: undefined };
    const parsed = v.safeParse(ConversationSnapshotSchema, raw);
    if (parsed.success) return { ok: true, snapshot: parsed.output };
    this.log.badSnapshot();
    return { ok: true, snapshot: undefined };
  }

  /** Сессия сервера и исполнитель личности получателя. */
  private build(
    peer: string,
    uuid: string,
    snapshot: ConversationSnapshot | undefined,
  ): Hosted {
    const { app, codes, server, observer, callers, logger } = this.spec;
    const session = server.session({
      subjectId: uuid,
      channel: { name: app.channel },
      resolve: (trace) => callers.resolve(uuid, trace),
    });
    const runtime = new ScreenRuntime({
      set: app.set,
      codes,
      ucs: session,
      refresh: session,
      observer,
      app,
    });
    const conversation = new Conversation(
      {
        app,
        runtime,
        contexts: { context: (trace) => this.contexts.of(uuid, trace) },
        traces: this.traces,
        views: this.spec.views,
        messenger: this.messenger,
        logger,
        peer,
        person: uuid,
        home: this.home,
        epochs: this.epochs,
        shown: () => this.shown(peer, conversation),
        ...(this.spec.exits === undefined ? {} : { exits: this.spec.exits }),
        ...(this.spec.texts === undefined ? {} : { texts: this.spec.texts }),
      },
      snapshot,
    );
    return {
      person: uuid,
      conversation,
      close: () => {
        conversation.close();
        session.close();
      },
    };
  }

  /** Бесед в памяти больше предела — давние нетронутые выгружаются; `current` — нет. */
  private async unload(current: string): Promise<void> {
    const excess = this.hosted.size - this.limit;
    if (excess <= 0) return;
    const victims = [...this.hosted]
      .filter(([peer]) => peer !== current)
      .slice(0, excess);
    await Promise.all(
      victims.map(([peer, hosted]) => this.evict(peer, hosted)),
    );
  }

  /** В очереди собеседника: дождаться беседы, сохранить снимок, закрыть. */
  private evict(peer: string, hosted: Hosted): Promise<void> {
    return this.lines.run(peer, async () => {
      if (this.hosted.get(peer) !== hosted) return;
      this.hosted.delete(peer);
      await hosted.conversation.settled();
      await this.save(peer, hosted.conversation);
      hosted.close();
    });
  }

  /** Проактивный показ отработал: снимок — в очереди собеседника; выгруженная беседа не пишется. */
  private shown(peer: string, conversation: Conversation): void {
    this.lines
      .run(peer, async () => {
        if (this.hosted.get(peer)?.conversation !== conversation) return;
        await this.save(peer, conversation);
      })
      .catch((error: unknown) => {
        this.log.defect({ operation: 'refresh' }, error);
      });
  }

  /** Единственное место записи: снимок сверх схемы не пишется — в хранилище прежний. */
  private async save(peer: string, conversation: Conversation): Promise<void> {
    try {
      const snapshot = conversation.snapshot();
      if (!v.safeParse(ConversationSnapshotSchema, snapshot).success) {
        this.log.badSave();
        return;
      }
      await this.spec.store.save(peer, snapshot);
    } catch (error) {
      this.log.storeFailed('save', error);
    }
  }

  /** Хранилище не прочиталось: заметка обычным показом и ответ на нажатие. */
  private async later(signal: ConversationSignal): Promise<void> {
    const delivery = await this.messenger.show(signal.peer, LATER);
    if (!delivery.ok) this.log.undelivered('show', delivery.error.reason);
    await this.answer(signal);
  }

  /** Ответ на нажатие, которое беседа не исполнила. */
  private async answer(signal: ConversationSignal): Promise<void> {
    if (signal.kind !== 'press') return;
    const delivery = await this.messenger.answer(signal.peer, signal.press);
    if (!delivery.ok) this.log.undelivered('answer', delivery.error.reason);
  }
}
