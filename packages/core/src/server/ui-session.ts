import {
  type AnyEventDef,
  type Identified,
  type SerializedResult,
  Trace,
} from 'dmg-core';
import { EventSubscriber, type TracedHandler } from 'dmg-core/app';
import type { AddressJson } from '../address/address-codec.types';
import type { RefreshOn } from '../manifest/refresh-on';
import type {
  RefreshPort,
  RefreshSignal,
  UcCause,
  UcPort,
} from '../runtime/ports.types';
import { jsonRecord } from './json-record';
import type { UiSessionSpec } from './ui-session.types';

export type { UiSessionSpec } from './ui-session.types';

/** Сколько выданных сигналов сессия помнит для следа перечитывания. */
const ISSUED_LIMIT = 256;

/**
 * Сессия одной личности канала на сервере: порты исполнителя (`UcPort`,
 * `RefreshPort`) и подписки узлов канала. Вызывающий — из источника на
 * каждый вызов; след сервер собирает сам по причине вызова; чужое событие
 * отсекается по `subjectId` сессии.
 */
export class UiSession<U extends Identified> implements UcPort, RefreshPort {
  private readonly subscriber: EventSubscriber;
  /** Настоящие следы событий по `eventId` выданных сессии сигналов. */
  private readonly issued = new Map<string, Trace>();
  private readonly issuedLimit: number;
  private closed = false;

  constructor(private readonly spec: UiSessionSpec<U>) {
    this.subscriber = new EventSubscriber(spec.context, spec.name);
    this.issuedLimit = spec.issuedLimit ?? ISSUED_LIMIT;
  }

  /**
   * Вызов UC от клиента: вход — недоверенный JSON (`UcCall` по замыслу),
   * форму и причину сверяет `ServerCalls`.
   */
  call(raw: unknown): Promise<SerializedResult> {
    const { source } = this.spec;
    return this.spec.calls.call(raw, {
      trace: (cause) => this.traceOf(cause),
      resolve: (trace) => source.resolve(trace),
    });
  }

  /**
   * Подписка экземпляра: по событию из `refresh` экрана. Сигнал — без
   * payload, след обезличен (`correlationId` — `eventId`), настоящий след
   * сессия помнит. Адрес не декодируется — бросок; после `close()` —
   * пустая отписка без подписки.
   */
  watch(
    address: AddressJson,
    listener: (signal: RefreshSignal) => void,
  ): () => void {
    const decoded = this.spec.codec.decode(address);
    if (!decoded.ok) {
      throw new Error(
        `UiSession: адрес подписки не декодируется (${decoded.error.reason})`,
      );
    }
    if (this.closed) return () => {};
    const { screen, params } = decoded.value;
    const values = jsonRecord(params);
    const byEvent = new Map<AnyEventDef, RefreshOn[]>();
    for (const record of screen.refresh) {
      byEvent.set(record.event, [...(byEvent.get(record.event) ?? []), record]);
    }
    const subjectId = this.spec.source.subjectId;
    const offs = [...byEvent].map(([event, records]) =>
      this.subscriber.on(event, async (envelope, trace) => {
        const payload = jsonRecord(envelope.payload);
        if (!records.some((r) => r.matches(payload, values, subjectId))) {
          return;
        }
        const { eventId } = envelope;
        this.remember(eventId, trace);
        listener({
          event: envelope.name,
          eventId,
          trace: { cause: { kind: 'event', eventId }, correlationId: eventId },
        });
      }),
    );
    return () => {
      for (const off of offs) off();
    };
  }

  /** Подписка узла канала; узел неизвестен или событие не объявлено — бросок. */
  on<D extends AnyEventDef>(
    node: string,
    def: D,
    handler: TracedHandler<D>,
  ): () => void {
    const declared = this.spec.listens.get(node);
    if (declared === undefined) {
      throw new Error(`UiSession: неизвестный узел канала ${node}`);
    }
    declared.assert(def, `узел канала ${node} не объявил событие ${def.name}`);
    return this.subscriber.on(def, handler);
  }

  /** Снимает все подписки сессии и забывает выданные сигналы. */
  close(): void {
    this.closed = true;
    this.subscriber.close();
    this.issued.clear();
  }

  /**
   * `requestId` — след запроса с каналом сессии, `correlationId` —
   * `requestId`. `eventId` — настоящий след выданного сигнала; не выдан или
   * забыт — свой след запроса сервера (`generated`): экземпляр не теряет
   * экран.
   */
  private traceOf(cause: UcCause): Trace {
    const { channel } = this.spec.source;
    const channelMeta = channel === undefined ? {} : { channel };
    if ('requestId' in cause) {
      return Trace.fromRequest({ requestId: cause.requestId, ...channelMeta });
    }
    // Без лога: вытеснение из памяти — обычный ход при всплеске событий.
    return (
      this.issued.get(cause.eventId) ?? Trace.fromRequest(channelMeta, () => {})
    );
  }

  /** Память ограничена: старейший выданный сигнал забывается первым. */
  private remember(eventId: string, trace: Trace): void {
    this.issued.delete(eventId);
    this.issued.set(eventId, trace);
    for (const oldest of this.issued.keys()) {
      if (this.issued.size <= this.issuedLimit) break;
      this.issued.delete(oldest);
    }
  }
}
