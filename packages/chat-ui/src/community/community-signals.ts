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
import type { ChatSignalField, ChatSignalSpec } from './community.types';
import type { CommunityLog } from './community-log';
import type { CommunityLookup } from './community-lookup';

/**
 * Сигналы сообщества: пределы, отсев (вид, handle, участник, `id`) до
 * исполнения, очередь на handle, ключ из `keys`, uuid — только
 * `people(member)` и только если вход манифеста берёт человека; вход UC по
 * `input`. Операций сообщества не исполняет. Не бросает.
 */
export class CommunitySignals<U extends Identified> {
  private readonly seen: SeenIds;
  private readonly lines = new PeerQueues();
  private readonly requestIds: () => string;

  constructor(
    private readonly spec: CommunitiesSpec<U>,
    private readonly bound: readonly Bound<ChatSignalSpec, U>[],
    private readonly lookup: CommunityLookup,
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
      // Ключ принимается до исполнения: повтор после сбоя UC не вызывается.
      if (!this.seen.accept(CommunitySignals.seenKey(signal))) return;
      await this.lines.run(signal.community, () => this.handle(signal, bound));
    } catch (error) {
      this.log.signalFailed(signal.kind, error);
    }
  }

  private async handle(
    signal: CommunitySignal,
    bound: readonly Bound<ChatSignalSpec, U>[],
  ): Promise<void> {
    const key = await this.lookup.key(signal.community);
    if (key === undefined) {
      this.log.unknownCommunity(signal.kind);
      return;
    }
    const { member } = signal;
    const person =
      member === undefined ||
      member === '' ||
      !bound.some(({ spec }) => CommunitySignals.takesPerson(spec))
        ? undefined
        : await this.lookup.person(member);
    const trace = Trace.fromRequest({
      requestId: this.requestIds(),
      channel: { name: this.spec.app.channel },
    });
    for (const one of bound) {
      // Фильтр незнакомых — только для входа с человеком: иначе личность не нужна.
      const { spec } = one;
      const stranger =
        person === undefined && CommunitySignals.takesPerson(spec);
      if (stranger && spec.strangers !== true) {
        this.log.stranger(signal.kind);
        continue;
      }
      await this.call(
        one,
        signal,
        CommunitySignals.input(spec, key, person),
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
        const value = CommunitySignals.value(from, key, person);
        return value === undefined ? [] : [[field, value]];
      }),
    );
  }

  private static value(
    from: ChatSignalField,
    key: string,
    person: string | undefined,
  ): string | undefined {
    switch (from) {
      case 'community':
        return key;
      case 'person':
        return person;
      default:
        return CommunitySignals.unknown(from);
    }
  }

  /** Вход манифеста берёт uuid человека. */
  private static takesPerson(spec: ChatSignalSpec): boolean {
    return Object.values(spec.input).includes('person');
  }

  /** Ключ отсева: один `id` апдейта бывает у нескольких участников и групп. */
  private static seenKey({ kind, community, member, id }: CommunitySignal) {
    return JSON.stringify([kind, community, member ?? null, id]);
  }

  /**
   * Предел сигнала нарушен — причина; в пределах — `undefined`. Поле не
   * строкой (числа транспорта) — та же причина, что длина не по пределу.
   */
  private static rejects(
    signal: CommunitySignal,
  ): 'signalId' | 'community' | 'member' | undefined {
    const { id, community, member } = signal;
    if (typeof id !== 'string' || id.length > MAX_SIGNAL_ID) return 'signalId';
    if (
      typeof community !== 'string' ||
      community.length === 0 ||
      community.length > MAX_PEER_LENGTH
    ) {
      return 'community';
    }
    if (
      member !== undefined &&
      (typeof member !== 'string' || member.length > MAX_PEER_LENGTH)
    ) {
      return 'member';
    }
    return undefined;
  }

  private static unknown(from: never): never {
    throw new Error(`неизвестный источник поля сигнала: ${String(from)}`);
  }
}
