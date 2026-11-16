import type { TraceJson } from 'dmg-core';
import type { AddressJson } from '../address/address-codec.types';
import { ActionRun } from './action-run';
import type { ActRequest, LocalRequest } from './action-run.types';
import { InstanceQueue } from './instance-queue';
import { InstanceRecords } from './instance-records';
import type {
  ActionOutcome,
  InstanceJson,
  InstanceView,
  LocalOutcome,
} from './outcome.types';
import type { RefreshSignal } from './ports.types';
import type {
  InstanceLoad,
  InstanceStart,
  ScreenInstanceSpec,
} from './screen-instance.types';
import type { ScreenFrame } from './screen-unit.types';

export type {
  InstanceLoad,
  InstanceStart,
  ScreenInstanceSpec,
} from './screen-instance.types';

/**
 * Экземпляр экрана одной личности: данные, состояние, ревизия, подписка на
 * перечитывание. `act`, `local` и перечитывание идут по одному через
 * очередь; ревизия растёт только при загрузке. Создаёт `ScreenRuntime`.
 */
export class ScreenInstance {
  private readonly spec: ScreenInstanceSpec;
  private readonly records: InstanceRecords;
  private readonly node: string;
  private readonly json: AddressJson;
  private readonly queue = new InstanceQueue();
  private readonly listeners = new Set<() => void>();
  private readonly unwatch: () => void;
  private loaded: InstanceLoad;
  private revision: number;
  private state: unknown;
  private trace: TraceJson;
  private closed = false;

  private constructor(
    spec: ScreenInstanceSpec,
    records: InstanceRecords,
    start: InstanceStart,
    loaded: InstanceLoad,
  ) {
    this.spec = spec;
    this.records = records;
    this.node = spec.ids.screen(spec.address.screen);
    this.json = spec.codec.encode(spec.address);
    this.loaded = loaded;
    this.revision = start.revision + 1;
    this.state = loaded.status === 'ready' ? loaded.state : start.state;
    this.trace = start.trace;
    this.unwatch = spec.refresh.watch(this.json, (signal) => {
      void this.refresh(signal);
    });
  }

  /** Загрузка и экземпляр; отказ или дефект загрузки — статус `refused`. */
  static async start(
    spec: ScreenInstanceSpec,
    start: InstanceStart,
  ): Promise<ScreenInstance> {
    const records = new InstanceRecords(spec.observer, crypto.randomUUID());
    const node = spec.ids.screen(spec.address.screen);
    const loaded = await ScreenInstance.load(
      spec,
      records,
      start.trace,
      start.state,
    );
    const instance = new ScreenInstance(spec, records, start, loaded);
    records.opened(node, start.trace, instance.revision);
    return instance;
  }

  /** Действие по запросу канала; исход — после всех шагов, без броска. */
  act(request: ActRequest): Promise<ActionOutcome> {
    return this.queue.run(async () => {
      const node = this.spec.ids.action(
        this.spec.address.screen,
        request.action,
      );
      this.records.acted(node, request.trace, this.revision);
      const end = await new ActionRun({
        unit: this.spec.unit,
        frame: this.frame(),
        closed: this.closed,
        revision: this.revision,
        context: this.spec.context,
        request,
        node: this.node,
        actionNode: node,
        ucs: this.spec.ucs,
        codec: this.spec.codec,
        records: this.records,
      }).run();
      let outcome: ActionOutcome;
      if (end.kind === 'stay') {
        await this.reload(request.trace);
        this.notify();
        outcome = { kind: 'stayed', revision: this.revision };
      } else {
        outcome = end.outcome;
      }
      if (outcome.kind === 'exited') this.close();
      this.records.outcome(node, request.trace, outcome);
      return outcome;
    });
  }

  /**
   * Локальное действие: новое состояние без UC и без смены ревизии. Дефект
   * кода — исход `refused`, экземпляр прежний; запись `defect` — со следом
   * последней загрузки: своего следа у локального действия нет.
   */
  local(request: LocalRequest): Promise<LocalOutcome> {
    return this.queue.run(async () => {
      const { unit } = this.spec;
      if (this.closed) return { kind: 'unavailable', reason: 'closed' };
      if (!unit.hasLocal(request.name)) {
        return { kind: 'unavailable', reason: 'unknown' };
      }
      const frame = this.frame();
      if (frame === undefined)
        return { kind: 'unavailable', reason: 'disabled' };
      try {
        if (!unit.available(request.name, frame)) {
          return { kind: 'unavailable', reason: 'disabled' };
        }
        const next = unit.applyLocal(request.name, request.input, frame);
        if (!next.ok) return { kind: 'rejected', issues: next.error.issues };
        const changed = { ...frame, state: next.value };
        this.loaded = {
          status: 'ready',
          data: changed.data,
          state: changed.state,
          presentation: unit.present(changed, this.spec.context.readOnly),
        };
        this.state = next.value;
      } catch (error) {
        const node = this.spec.ids.action(
          this.spec.address.screen,
          request.name,
        );
        this.records.defect(node, this.trace, error);
        return { kind: 'refused', refusal: unit.refusals.defect() };
      }
      this.notify();
      return { kind: 'changed' };
    });
  }

  /** Перечитывание по сигналу — в очереди, `read` со следом сигнала. */
  refresh(signal: RefreshSignal): Promise<void> {
    return this.queue.run(async () => {
      if (this.closed) return;
      await this.reload(signal.trace);
      this.records.refreshed(this.node, signal.trace, this.revision);
      this.notify();
    });
  }

  view(): InstanceView {
    const { def } = this.spec.unit;
    const base = {
      screen: this.node,
      address: this.json,
      revision: this.revision,
      context: this.spec.context,
      ...(def.primary === undefined ? {} : { primary: def.primary }),
    };
    if (this.loaded.status === 'refused') {
      return {
        ...base,
        status: 'refused',
        refusal: this.loaded.refusal,
        actions: [],
        locals: [],
      };
    }
    const { data, state, presentation } = this.loaded;
    return {
      ...base,
      status: 'ready',
      data,
      ...(state === undefined ? {} : { state }),
      ...presentation,
    };
  }

  snapshot(): InstanceJson {
    return { address: this.json, state: this.state, revision: this.revision };
  }

  /** Подписка на изменение вида; возвращает отписку. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Закрыть: снять подписку перечитывания; дальше действия недоступны. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unwatch();
  }

  /** Перечитать на месте: ревизия + 1, состояние сохраняется по схеме. */
  private async reload(trace: TraceJson): Promise<void> {
    const { spec, records } = this;
    this.loaded = await ScreenInstance.load(spec, records, trace, this.state);
    if (this.loaded.status === 'ready') this.state = this.loaded.state;
    this.revision += 1;
    this.trace = trace;
  }

  private frame(): ScreenFrame | undefined {
    if (this.loaded.status !== 'ready') return undefined;
    const { data, state } = this.loaded;
    return { params: this.spec.address.params, data, state };
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  /** Загрузка юнита и вид; отказ — запись `refused`, дефект — `defect`. */
  private static async load(
    spec: ScreenInstanceSpec,
    records: InstanceRecords,
    trace: TraceJson,
    prevState: unknown,
  ): Promise<InstanceLoad> {
    const { unit, address, context, ucs, ids } = spec;
    const node = ids.screen(address.screen);
    const code = { locale: context.locale, timeZone: context.timeZone };
    const res = await unit.load(
      address.params,
      { node, ucs, trace },
      code,
      prevState,
    );
    if (res.kind === 'refused') {
      records.refused(node, trace, res.refusal);
      return { status: 'refused', refusal: res.refusal };
    }
    let cause: unknown;
    if (res.kind === 'defect') {
      cause = res.cause;
    } else {
      try {
        const frame = {
          params: address.params,
          data: res.data,
          state: res.state,
        };
        const presentation = unit.present(frame, context.readOnly);
        return {
          status: 'ready',
          data: res.data,
          state: res.state,
          presentation,
        };
      } catch (error) {
        cause = error;
      }
    }
    records.defect(node, trace, cause);
    return { status: 'refused', refusal: unit.refusals.defect() };
  }
}
