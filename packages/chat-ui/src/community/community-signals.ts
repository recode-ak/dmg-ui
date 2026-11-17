import { type Identified, Trace } from 'dmg-core';
import {
  MAX_PEER_LENGTH,
  MAX_SIGNAL_ID,
} from '../conversation/conversation.const';
import { PeerQueues } from '../conversation/peer-queues';
import { SeenIds } from '../conversation/seen-ids';
import type { CommunitySignal } from '../messenger/messenger.types';
import type { Bound, CommunitiesSpec } from './communities.types';
import { MAX_COMMUNITY_SIGNALS } from './community.const';
import type { ChatSignalSpec } from './community.types';
import type { CommunityLog } from './community-log';

/**
 * Сигналы сообщества: пределы, отсев по `id` до исполнения, очередь на
 * handle, ключ сообщества из `keys`, uuid — только `people(member)`; вход UC
 * по `input` манифеста. Операций сообщества не исполняет. Не бросает.
 */
export class CommunitySignals<U extends Identified> {
  private readonly seen: SeenIds;
  private readonly lines = new PeerQueues();
  private readonly requestIds: () => string;

  constructor(
    private readonly spec: CommunitiesSpec<U>,
    private readonly bound: readonly Bound<ChatSignalSpec, U>[],
    private readonly log: CommunityLog,
  ) {
    this.seen = new SeenIds([], spec.limit?.signals ?? MAX_COMMUNITY_SIGNALS);
    this.requestIds = spec.requestIds ?? (() => crypto.randomUUID());
  }

  async receive(signal: CommunitySignal): Promise<void> {
    try {
      const reason = CommunitySignals.rejects(signal);
      if (reason !== undefined) {
        this.log.rejected(signal.kind, reason);
        return;
      }
      const bound = this.bound.filter(
        ({ spec }) => spec.signal === signal.kind,
      );
      if (bound.length === 0) return;
      // id принимается до исполнения: повтор после сбоя UC не вызывается.
      if (!this.seen.accept(signal.id)) return;
      await this.lines.run(signal.community, () => this.handle(signal, bound));
    } catch (error) {
      this.log.signalFailed(signal.kind, error);
    }
  }

  private async handle(
    signal: CommunitySignal,
    bound: readonly Bound<ChatSignalSpec, U>[],
  ): Promise<void> {
    const key = await this.spec.keys(signal.community);
    if (key === undefined) {
      this.log.unknownCommunity(signal.kind);
      return;
    }
    const { member } = signal;
    const person =
      member === undefined || member === ''
        ? undefined
        : await this.spec.people(member);
    const trace = Trace.fromRequest({
      requestId: this.requestIds(),
      channel: { name: this.spec.app.channel },
    });
    for (const one of bound) {
      if (person === undefined && one.spec.strangers !== true) {
        this.log.stranger(signal.kind);
        continue;
      }
      await this.call(
        one,
        signal,
        CommunitySignals.input(one.spec, key, person),
        trace,
      );
    }
  }

  /** Вызов UC манифеста; отказ — `warn` с кодом, бросок бэкенда — `error` с именем. */
  private async call(
    { spec, module, caller }: Bound<ChatSignalSpec, U>,
    signal: CommunitySignal,
    input: Readonly<Record<string, string>>,
    trace: Trace,
  ): Promise<void> {
    try {
      const wire = await this.spec.dispatch.dispatch({
        module,
        uc: spec.uc,
        input,
        caller,
        trace,
      });
      const result = spec.uc.restoreResult(wire);
      if (!result.ok) this.log.signalRefused(signal.kind, result.error.code);
    } catch (error) {
      this.log.signalFailed(signal.kind, error);
    }
  }

  /** Вход UC: ключ сообщества и uuid человека по `input`; незнакомому — без поля человека. */
  private static input(
    spec: ChatSignalSpec,
    key: string,
    person: string | undefined,
  ): Readonly<Record<string, string>> {
    // `fromEntries` — свои поля: имя поля `__proto__` не меняет прототип.
    return Object.fromEntries(
      Object.entries(spec.input).flatMap(([field, from]) => {
        const value = from === 'community' ? key : person;
        return value === undefined ? [] : [[field, value]];
      }),
    );
  }

  /** Предел сигнала нарушен — причина; в пределах — `undefined`. */
  private static rejects(
    signal: CommunitySignal,
  ): 'signalId' | 'community' | 'member' | undefined {
    if (signal.id.length > MAX_SIGNAL_ID) return 'signalId';
    const { community, member } = signal;
    if (community.length === 0 || community.length > MAX_PEER_LENGTH) {
      return 'community';
    }
    if (member !== undefined && member.length > MAX_PEER_LENGTH) {
      return 'member';
    }
    return undefined;
  }
}
