import type { AnyEventDef, Identified, Trace } from 'dmg-core';
import { type EventEnvelope, EventSubscriber } from 'dmg-core/app';
import { PeerQueues } from '../conversation/peer-queues';
import { SeenIds } from '../conversation/seen-ids';
import { Sha256 } from '../conversation/sha256';
import { LOG_SOURCE } from '../messenger/messenger.const';
import type {
  CommunityOperation,
  CommunityPort,
  Delivery,
} from '../messenger/messenger.types';
import type {
  Bound,
  CommunitiesSpec,
  ReactionCause,
  ReactionTarget,
} from './communities.types';
import { MAX_REACTED, MAX_TARGETS } from './community.const';
import type { ChatReactionSpec, ChatReactionTargets } from './community.types';
import type { CommunityLog } from './community-log';

/** Реакция одного узла: манифест, связанный сборкой. */
type Reaction<U extends Identified> = Bound<ChatReactionSpec, U>;

/**
 * Реакции сообщества: одна подписка на событие (`EventSubscriber`), на
 * реакцию — query UC от системы со следом события; цели — только строки его
 * выхода, переведённые `handles`/`members`. Отсев по ключу после успешной
 * операции, очередь на ключ сообщества. Обработчик тотален: не бросает.
 */
export class CommunityReactions<U extends Identified> {
  private readonly seen: SeenIds;
  private readonly lines = new PeerQueues();
  private readonly subscriber: EventSubscriber;

  constructor(
    private readonly spec: CommunitiesSpec<U>,
    private readonly bound: readonly Reaction<U>[],
    private readonly port: CommunityPort,
    private readonly log: CommunityLog,
  ) {
    this.seen = new SeenIds([], spec.limit?.reactions ?? MAX_REACTED);
    this.subscriber = new EventSubscriber(spec.context, LOG_SOURCE);
  }

  /** Подписывает события реакций, одно на событие; возвращает отписку. */
  subscribe(): () => void {
    const groups = new Map<
      string,
      { readonly event: AnyEventDef; readonly reactions: Reaction<U>[] }
    >();
    for (const one of this.bound) {
      const { event } = one.spec;
      const group = groups.get(event.name) ?? { event, reactions: [] };
      group.reactions.push(one);
      groups.set(event.name, group);
    }
    const offs = [...groups.values()].map(({ event, reactions }) =>
      this.subscriber.on(event, (envelope, trace) =>
        this.react(reactions, envelope, trace),
      ),
    );
    return () => {
      for (const off of offs) off();
    };
  }

  /** Все реакции события по порядку; сбой одной — запись лога, прочие идут. */
  private async react(
    reactions: readonly Reaction<U>[],
    envelope: EventEnvelope,
    trace: Trace,
  ): Promise<void> {
    for (const reaction of reactions) {
      const cause: ReactionCause = {
        reaction: reaction.node,
        event: envelope.name,
        eventId: envelope.eventId,
      };
      try {
        await this.reactOne(reaction, cause, envelope, trace);
      } catch (error) {
        this.log.reactionFailed(cause, error);
      }
    }
  }

  private async reactOne(
    { spec, module, caller, node }: Reaction<U>,
    cause: ReactionCause,
    envelope: EventEnvelope,
    trace: Trace,
  ): Promise<void> {
    const fields = CommunityReactions.record(envelope.payload) ?? {};
    const input = Object.fromEntries(
      Object.entries(spec.input).map(([field, from]) => [
        field,
        CommunityReactions.field(fields, from),
      ]),
    );
    const wire = await this.spec.dispatch.dispatch({
      module,
      uc: spec.uc,
      input,
      caller,
      trace,
    });
    const output = spec.uc.restoreResult(wire);
    if (!output.ok) {
      this.log.reactionRefused(cause, output.error.code);
      return;
    }
    const rows: readonly unknown[] = Array.isArray(output.value)
      ? output.value
      : [output.value];
    if (rows.length > MAX_TARGETS) this.log.skipped(cause, 'targets');
    for (const row of rows.slice(0, MAX_TARGETS)) {
      const target = CommunityReactions.target(row, spec.targets);
      if (target === undefined) {
        this.log.skipped(cause, 'target');
        continue;
      }
      try {
        await this.operate(spec.operation, node, cause, target);
      } catch (error) {
        this.log.reactionFailed(cause, error);
      }
    }
  }

  /**
   * Операция над целью в очереди её сообщества: повтор (реакция, событие,
   * цель) отсеян; ключ принимается только после успешной операции —
   * повтор после недоставки или броска исполнится.
   */
  private async operate(
    operation: CommunityOperation,
    node: string,
    cause: ReactionCause,
    { key, person }: ReactionTarget,
  ): Promise<void> {
    const seen = await Sha256.hex(
      JSON.stringify([node, cause.eventId, key, person]),
    );
    await this.lines.run(key, async () => {
      if (this.seen.has(seen)) return;
      const handle = await this.spec.handles(key);
      if (handle === undefined) {
        this.log.skipped(cause, 'noHandle');
        return;
      }
      const member = await this.spec.members(person);
      if (member === undefined) {
        this.log.skipped(cause, 'noMember');
        return;
      }
      let delivery: Delivery<void>;
      try {
        delivery = await this.execute(operation, handle, member);
      } catch (error) {
        this.log.reactionFailed(cause, error, operation);
        return;
      }
      if (!delivery.ok) {
        this.log.undelivered(cause, operation, delivery.error.reason);
        return;
      }
      this.seen.accept(seen);
    });
  }

  private execute(
    operation: CommunityOperation,
    community: string,
    member: string,
  ): Promise<Delivery<void>> {
    switch (operation) {
      case 'exclude':
        return this.port.exclude(community, member);
      case 'invite':
        return this.port.invite(community, member);
      case 'approve':
        return this.port.approve(community, member);
      case 'inviteLink':
        // Сборка `Communities` не пускает такую реакцию (DEBT-UI-25).
        throw new Error('операция inviteLink не реализована');
      default:
        return CommunityReactions.unknown(operation);
    }
  }

  /** Цель — строковые непустые поля `targets` строки-объекта; иначе `undefined`. */
  private static target(
    row: unknown,
    targets: ChatReactionTargets,
  ): ReactionTarget | undefined {
    const fields = CommunityReactions.record(row);
    if (fields === undefined) return undefined;
    const key = CommunityReactions.field(fields, targets.community);
    const person = CommunityReactions.field(fields, targets.person);
    if (typeof key !== 'string' || key === '') return undefined;
    if (typeof person !== 'string' || person === '') return undefined;
    return { key, person };
  }

  /** Объект (не массив) — его поля; иначе `undefined`. */
  private static record(
    value: unknown,
  ): Readonly<Record<string, unknown>> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Readonly<Record<string, unknown>>)
      : undefined;
  }

  /** Своё поле объекта: унаследованные (`constructor`, `__proto__`) не читаются. */
  private static field(
    fields: Readonly<Record<string, unknown>>,
    name: string,
  ): unknown {
    return Object.hasOwn(fields, name) ? fields[name] : undefined;
  }

  private static unknown(operation: never): never {
    throw new Error(`неизвестная операция сообщества: ${String(operation)}`);
  }
}
