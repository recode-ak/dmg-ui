import { err, ok, type Result } from 'dmg-core';
import type { Address } from '../address/address';
import { AddressCodec } from '../address/address-codec';
import type { AddressRejection } from '../address/address-codec.types';
import { UiIds } from '../address/ui-ids';
import { AppReach } from '../manifest/app-reach';
import { ScreenInstance } from './screen-instance';
import { MAX_REVISION } from './screen-runtime.const';
import type { OpenOptions, ScreenRuntimeSpec } from './screen-runtime.types';
import { UcCalls } from './uc-calls';

export type { OpenOptions, ScreenRuntimeSpec } from './screen-runtime.types';

/**
 * Исполнитель экранов одной личности (сессии канала): открывает и
 * восстанавливает экземпляры. Знает манифесты, код, два порта и состав
 * приложения UI (`AppReach`); вызывающий и шина ему не видны.
 */
export class ScreenRuntime {
  private readonly spec: ScreenRuntimeSpec;
  private readonly ids: UiIds;
  private readonly codec: AddressCodec;
  private readonly calls: UcCalls;
  private readonly reach: AppReach;

  /** Загрузчики или приложение другого набора — ошибка сборки, бросок. */
  constructor(spec: ScreenRuntimeSpec) {
    if (spec.codes.set !== spec.set) {
      throw new Error(
        `ScreenRuntime: загрузчики кода набора ${spec.codes.set.name}, а исполнитель — ${spec.set.name}`,
      );
    }
    if (spec.app !== undefined && spec.app.set !== spec.set) {
      throw new Error(
        `ScreenRuntime: приложение ${spec.app.name} набора ${spec.app.set.name}, а исполнитель — ${spec.set.name}`,
      );
    }
    this.spec = spec;
    this.ids = new UiIds(spec.set);
    this.codec = new AddressCodec(spec.set);
    this.calls = new UcCalls(spec.set);
    this.reach = AppReach.of(spec.app);
  }

  /** Новый экземпляр по адресу; отказ загрузки — в его виде. */
  open(address: Address, options: OpenOptions): Promise<ScreenInstance> {
    return this.start(address, options, undefined, 0);
  }

  /**
   * Экземпляр из снимка канала (внешние данные): адрес не восстановлен
   * или ревизия не целое `≥ 0` либо больше `MAX_REVISION` — отказ,
   * состояние не по схеме — начальное.
   */
  async restore(
    json: unknown,
    options: OpenOptions,
  ): Promise<Result<ScreenInstance, AddressRejection>> {
    const snapshot = typeof json === 'object' && json !== null ? json : {};
    const address = this.codec.decode(
      'address' in snapshot ? snapshot.address : undefined,
    );
    if (!address.ok) return err(address.error);
    const revision = 'revision' in snapshot ? snapshot.revision : undefined;
    if (
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision < 0 ||
      revision > MAX_REVISION
    ) {
      return err({ reason: 'malformed' });
    }
    const state = 'state' in snapshot ? snapshot.state : undefined;
    return ok(await this.start(address.value, options, state, revision));
  }

  private async start(
    address: Address,
    { context, trace }: OpenOptions,
    state: unknown,
    revision: number,
  ): Promise<ScreenInstance> {
    const { codes, ucs, refresh, observer, faults } = this.spec;
    const unit = await codes.screen(address.screen);
    return ScreenInstance.start(
      {
        unit,
        address,
        ids: this.ids,
        codec: this.codec,
        context,
        calls: this.calls,
        reach: this.reach,
        ucs,
        refresh,
        observer,
        faults,
      },
      { trace, state, revision },
    );
  }
}
