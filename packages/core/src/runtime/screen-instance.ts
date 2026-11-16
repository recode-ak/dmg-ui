import type { TraceJson } from 'dmg-core';
import type { AddressJson } from '../address/address-codec.types';
import { ActionRun } from './action-run';
import type { ActRequest, LocalRequest } from './action-run.types';
import { InstanceQueue } from './instance-queue';
import { InstanceRecords } from './instance-records';
import { InstanceViews } from './instance-views';
import type {
  ActionOutcome,
  InstanceJson,
  InstanceView,
  LocalOutcome,
  ViewChange,
} from './outcome.types';
import type { RefreshSignal } from './ports.types';
import type {
  InstanceLoad,
  InstanceStart,
  ScreenInstanceSpec,
} from './screen-instance.types';
import type { ScreenFrame } from './screen-unit.types';
import { SignalInbox } from './signal-inbox';

export type {
  InstanceLoad,
  InstanceStart,
  ScreenInstanceSpec,
} from './screen-instance.types';

/**
 * Экземпляр экрана одной личности: данные, состояние, ревизия, подписка на
 * перечитывание. `act`, `local` и перечитывание идут по одному через
 * очередь; ревизия растёт только при загрузке. Подписка живёт, пока
 * экземпляр открыт и загружен: в отказе сигналов нет.
 */
export class ScreenInstance {
  private readonly spec: ScreenInstanceSpec;
  private readonly records: InstanceRecords;
  private readonly node: string;
  private readonly json: AddressJson;
  private readonly queue = new InstanceQueue();
  private readonly views: InstanceViews;
  private readonly listeners = new Set<(change: ViewChange) => void>();
  private unwatch: (() => void) | undefined;
  private loaded: InstanceLoad;
  private revision: number;
  private state: unknown;
  private trace: TraceJson;
  private closed = false;
  /** Сигнал ожидающего перечитывания; в очереди оно одно. */
  private pending: RefreshSignal | undefined;
  private pendingRun: Promise<void> | undefined;

  private constructor(
    spec: ScreenInstanceSpec,
    parts: {
      readonly records: InstanceRecords;
      readonly node: string;
      readonly json: AddressJson;
      readonly views: InstanceViews;
      readonly unwatch: (() => void) | undefined;
    },
    start: InstanceStart,
    loaded: InstanceLoad,
  ) {
    this.spec = spec;
    this.records = parts.records;
    this.node = parts.node;
    this.json = parts.json;
    this.views = parts.views;
    this.unwatch = parts.unwatch;
    this.loaded = loaded;
    this.revision = start.revision + 1;
    this.state = loaded.status === 'ready' ? loaded.state : start.state;
    this.trace = start.trace;
  }

  /**
   * Подписка, затем загрузка; сигналы загрузки дают одно перечитывание.
   * Отказ или дефект загрузки — статус `refused`, подписка снята.
   */
  static async start(
    spec: ScreenInstanceSpec,
    start: InstanceStart,
  ): Promise<ScreenInstance> {
    const records = new InstanceRecords(
      spec.observer,
      crypto.randomUUID(),
      spec.faults,
    );
    const node = spec.ids.screen(spec.address.screen);
    const json = spec.codec.encode(spec.address);
    const views = new InstanceViews(spec.unit, node, json, spec.context);
    const inbox = new SignalInbox();
    const unwatch = spec.refresh.watch(json, inbox.listener);
    const loaded = await ScreenInstance.load(
      spec,
      { records, views },
      start.trace,
      start.state,
    );
    const ready = loaded.status === 'ready';
    if (!ready) unwatch();
    const instance = new ScreenInstance(
      spec,
      { records, node, json, views, unwatch: ready ? unwatch : undefined },
      start,
      loaded,
    );
    records.opened(node, start.trace, instance.revision);
    if (ready) {
      inbox.attach((signal) => {
        void instance.refresh(signal);
      });
    }
    return instance;
  }

  /** Действие по запросу канала; исход — после всех шагов, без броска. */
  act(request: ActRequest): Promise<ActionOutcome> {
    return this.queue.run(async () => {
      const { unit, ids, address } = this.spec;
      const node =
        unit.action(request.action) === undefined
          ? this.node
          : ids.action(address.screen, request.action);
      this.records.acted(node, request.trace, this.revision);
      const end = await new ActionRun({
        unit,
        frame: this.frame(),
        closed: this.closed,
        revision: this.revision,
        context: this.spec.context,
        request,
        calls: this.spec.calls,
        actionNode: node,
        ucs: this.spec.ucs,
        codec: this.spec.codec,
        records: this.records,
      }).run();
      let outcome: ActionOutcome;
      if (end.kind === 'stay') {
        await this.reload(request.trace);
        this.notify(request.trace, 'acted');
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
      if (frame === undefined) {
        return { kind: 'unavailable', reason: 'disabled' };
      }
      try {
        if (!unit.available(request.name, frame)) {
          return { kind: 'unavailable', reason: 'disabled' };
        }
        const next = unit.applyLocal(request.name, request.input, frame);
        if (!next.ok) return { kind: 'rejected', issues: next.error.issues };
        const changed = { ...frame, state: next.value };
        this.loaded = this.views.ready(changed);
        this.state = next.value;
      } catch (error) {
        const node = this.spec.ids.action(
          this.spec.address.screen,
          request.name,
        );
        const stage = `Экран ${unit.def.name}, локальное действие ${request.name}`;
        this.records.defect(node, this.trace, error, stage);
        return { kind: 'refused', refusal: unit.refusals.defect() };
      }
      this.notify(this.trace, 'local');
      return { kind: 'changed' };
    });
  }

  /**
   * Перечитывание по сигналу — в очереди, `read` со следом сигнала. Пока
   * перечитывание ждёт очереди, новые сигналы лишь заменяют его след.
   * Закрытый экземпляр или экземпляр в отказе сигнал не берёт.
   */
  refresh(signal: RefreshSignal): Promise<void> {
    this.pending = signal;
    if (this.pendingRun !== undefined) return this.pendingRun;
    const run = this.queue.run(async () => {
      const next = this.pending;
      this.pending = undefined;
      this.pendingRun = undefined;
      if (next === undefined || this.unwatch === undefined) return;
      await this.reload(next.trace);
      this.records.refreshed(this.node, next.trace, this.revision);
      this.notify(next.trace, 'refreshed');
    });
    this.pendingRun = run;
    return run;
  }

  /** Вид для канала при текущей ревизии. */
  view(): InstanceView {
    return this.views.view(this.revision, this.loaded);
  }

  snapshot(): InstanceJson {
    return { address: this.json, state: this.state, revision: this.revision };
  }

  /** Подписка на изменение вида с причиной и ревизией. Возвращает отписку. */
  onChange(listener: (change: ViewChange) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Закрыть: снять подписку перечитывания; дальше действия недоступны. */
  close(): void {
    this.closed = true;
    this.stopWatch();
  }

  /** Перечитать на месте: ревизия + 1; не `ready` — подписка снята. */
  private async reload(trace: TraceJson): Promise<void> {
    const { spec, records, views } = this;
    this.loaded = await ScreenInstance.load(
      spec,
      { records, views },
      trace,
      this.state,
    );
    if (this.loaded.status === 'ready') this.state = this.loaded.state;
    else this.stopWatch();
    this.revision += 1;
    this.trace = trace;
  }

  private stopWatch(): void {
    const unwatch = this.unwatch;
    this.unwatch = undefined;
    unwatch?.();
  }

  private frame(): ScreenFrame | undefined {
    if (this.loaded.status !== 'ready') return undefined;
    const { data, state } = this.loaded;
    return { params: this.spec.address.params, data, state };
  }

  /** Слушатели вида; бросок слушателя — в `faults`, исполнение идёт дальше. */
  private notify(trace: TraceJson, cause: ViewChange['cause']): void {
    const change: ViewChange = { cause, revision: this.revision };
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (error) {
        this.records.fault(this.node, trace, error);
      }
    }
  }

  /** Загрузка юнита и вид; отказ — запись `refused`, дефект — `defect`. */
  private static async load(
    spec: ScreenInstanceSpec,
    {
      records,
      views,
    }: { readonly records: InstanceRecords; readonly views: InstanceViews },
    trace: TraceJson,
    prevState: unknown,
  ): Promise<InstanceLoad> {
    const { unit, address, context, calls, ucs, ids } = spec;
    const node = ids.screen(address.screen);
    const code = { locale: context.locale, timeZone: context.timeZone };
    const where = `Экран ${unit.def.name}`;
    const res = await unit.load(
      address.params,
      { calls, ucs, trace },
      code,
      prevState,
    );
    if (res.kind === 'refused') {
      records.refused(node, trace, res.refusal);
      return { status: 'refused', refusal: res.refusal };
    }
    let cause: unknown;
    let stage: string;
    if (res.kind === 'defect') {
      cause = res.cause;
      stage = `${where}: загрузка`;
    } else {
      try {
        return views.ready({
          params: address.params,
          data: res.data,
          state: res.state,
        });
      } catch (error) {
        cause = error;
        stage = `${where}: вид`;
      }
    }
    records.defect(node, trace, cause, stage);
    return { status: 'refused', refusal: unit.refusals.defect() };
  }
}
