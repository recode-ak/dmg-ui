import type { AnyEventDef, Identified, SerializedResult } from 'dmg-core';
import { EventSubscriber, type TracedHandler } from 'dmg-core/app';
import type { AddressJson } from '../address/address-codec.types';
import type { RefreshOn } from '../manifest/refresh-on';
import type {
  RefreshPort,
  RefreshSignal,
  UcCall,
  UcPort,
} from '../runtime/ports.types';
import { jsonRecord } from './json-record';
import type { UiSessionSpec } from './ui-session.types';

export type { UiSessionSpec } from './ui-session.types';

/**
 * Сессия одной личности канала на сервере: порты исполнителя (`UcPort`,
 * `RefreshPort`) и подписки узлов канала. Вызывающий — из источника на
 * каждый вызов; чужое событие отсекается по `subjectId` сессии.
 */
export class UiSession<U extends Identified> implements UcPort, RefreshPort {
  private readonly subscriber: EventSubscriber;

  constructor(private readonly spec: UiSessionSpec<U>) {
    this.subscriber = new EventSubscriber(spec.context, spec.name);
  }

  call(call: UcCall): Promise<SerializedResult> {
    const { source } = this.spec;
    return this.spec.calls.call(call, (trace) => source.resolve(trace));
  }

  /**
   * Подписка экземпляра: по событию из `refresh` экрана, сигнал — без
   * payload. Адрес не декодируется — бросок: подписка без экрана — дефект.
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
        listener({
          event: envelope.name,
          eventId: envelope.eventId,
          trace: trace.toJSON(),
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

  /** Снимает все подписки сессии. */
  close(): void {
    this.subscriber.close();
  }
}
