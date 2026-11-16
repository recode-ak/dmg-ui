import { type Identified, Trace } from 'dmg-core';
import { ScreenRuntime } from 'dmg-ui';
import { RenderContexts } from 'dmg-ui/server';
import * as v from 'valibot';
import { DialogReplies } from '../dialog/dialog-replies';
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

/**
 * Узел бесед одного приложения мессенджера (D-UI-43): личность отправителя —
 * только порт `people`, беседа собеседника — в памяти или из хранилища по
 * схеме снимка, снимок пишется после каждого сигнала. Бесед в памяти не
 * больше предела: давняя всех нетронутая выгружается. Внешний вход не
 * бросает (ERR-01); в лог — только мессенджер, вид, причина, операция и имя
 * ошибки (ERR-07).
 */
export class Conversations<U extends Identified> {
  private readonly spec: ConversationsSpec<U>;
  private readonly messenger: LimitedMessenger;
  private readonly log: ConversationLog;
  private readonly replies: DialogReplies;
  private readonly contexts: RenderContexts<U>;
  private readonly traces: SignalTraces;
  private readonly home: string;
  private readonly limit: number;
  private readonly epochs: () => string;
  private readonly hosted = new Map<string, Hosted>();
  private readonly lines = new PeerQueues();

  /** Нет входа home, возможности не годятся, представления другого набора — бросок при сборке. */
  constructor(spec: ConversationsSpec<U>) {
    const { app, views } = spec;
    if (views.set !== app.set) {
      throw new Error(
        `Conversations: представления набора ${views.set.name}, а приложение — ${app.set.name}`,
      );
    }
    this.messenger = new LimitedMessenger({
      port: spec.messenger,
      logger: spec.logger,
    });
    this.home = spec.home ?? CONVERSATION_HOME;
    Conversation.assertFits(app, this.home, this.messenger.capabilities);
    this.spec = spec;
    this.log = new ConversationLog(
      spec.logger,
      this.messenger.capabilities.name,
    );
    this.replies = new DialogReplies(views);
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
      await this.lines.run(signal.peer, () => this.deliver(signal));
      await this.unload(signal.peer);
    } catch (error) {
      this.log.defect({ kind: signal.kind }, error);
    }
  }

  /** Все беседы в памяти отработали очередь. */
  async settled(): Promise<void> {
    await this.lines.idle();
    await Promise.all(
      [...this.hosted.values()].map((hosted) => hosted.conversation.settled()),
    );
  }

  /** Снимки сохранены, подписки сняты, беседы выгружены. */
  async close(): Promise<void> {
    await this.lines.idle();
    await Promise.all(
      [...this.hosted].map(([peer, hosted]) => this.evict(peer, hosted)),
    );
  }

  /** Личность, беседа, исполнение и снимок — в очереди собеседника. */
  private async deliver(signal: ConversationSignal): Promise<void> {
    const uuid = await this.spec.people(signal.sender);
    if (uuid === undefined) {
      this.log.refused(signal.kind, CONVERSATION_TEXTS.noPerson);
      await this.answer(signal);
      return;
    }
    const hosted = await this.host(signal.peer, uuid);
    if (hosted === undefined) {
      // Чужая личность беседу не трогает: снимок прежний.
      this.log.refused(signal.kind, CONVERSATION_TEXTS.foreign);
      await this.answer(signal);
      return;
    }
    if (await hosted.conversation.receive(signal)) {
      await this.save(signal.peer, hosted);
    }
  }

  /** Беседа собеседника из памяти или из хранилища; владелец не `uuid` — `undefined`. */
  private async host(peer: string, uuid: string): Promise<Hosted | undefined> {
    const known = this.hosted.get(peer);
    if (known !== undefined) {
      if (known.person !== uuid) return undefined;
      // Порядок карты — давность: тронутая встаёт в конец.
      this.hosted.delete(peer);
      this.hosted.set(peer, known);
      return known;
    }
    const snapshot = await this.load(peer);
    if (snapshot !== undefined && snapshot.person !== uuid) return undefined;
    const hosted = this.build(peer, uuid, snapshot);
    this.hosted.set(peer, hosted);
    return hosted;
  }

  /** Снимок по схеме; нет, сбой или мусор — `undefined` (беседа заново). */
  private async load(peer: string): Promise<ConversationSnapshot | undefined> {
    let raw: unknown;
    try {
      raw = await this.spec.store.load(peer);
    } catch (error) {
      this.log.storeFailed('load', error);
      return undefined;
    }
    if (raw === undefined) return undefined;
    const parsed = v.safeParse(ConversationSnapshotSchema, raw);
    if (parsed.success) return parsed.output;
    this.log.badSnapshot();
    return undefined;
  }

  /** Сессия сервера и исполнитель личности — как у диалогового канала. */
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
    });
    const conversation = new Conversation(
      {
        app,
        runtime,
        contexts: { context: (trace) => this.contexts.of(uuid, trace) },
        traces: this.traces,
        replies: this.replies,
        messenger: this.messenger,
        logger,
        peer,
        person: uuid,
        home: this.home,
        epochs: this.epochs,
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
      await this.save(peer, hosted);
      hosted.close();
    });
  }

  private async save(peer: string, hosted: Hosted): Promise<void> {
    try {
      await this.spec.store.save(peer, hosted.conversation.snapshot());
    } catch (error) {
      this.log.storeFailed('save', error);
    }
  }

  /** Ответ на нажатие, которое беседа не исполнила. */
  private async answer(signal: ConversationSignal): Promise<void> {
    if (signal.kind !== 'press') return;
    const delivery = await this.messenger.answer(signal.peer, signal.press);
    if (!delivery.ok) this.log.undelivered('answer', delivery.error.reason);
  }
}
