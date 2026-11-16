import { err, ok, type Result } from 'dmg-core';
import type { Address } from '../address/address';
import { AddressCodec } from '../address/address-codec';
import type { AddressRejection } from '../address/address-codec.types';
import { UiIds } from '../address/ui-ids';
import { ScreenInstance } from './screen-instance';
import type { OpenOptions, ScreenRuntimeSpec } from './screen-runtime.types';

export type { OpenOptions, ScreenRuntimeSpec } from './screen-runtime.types';

/**
 * Исполнитель экранов одной личности (сессии канала): открывает и
 * восстанавливает экземпляры. Знает манифесты, код и два порта; вызывающий,
 * шина и приложение ему не видны.
 */
export class ScreenRuntime {
  private readonly spec: ScreenRuntimeSpec;
  private readonly ids: UiIds;
  private readonly codec: AddressCodec;

  /** Загрузчики другого набора — ошибка сборки, бросок. */
  constructor(spec: ScreenRuntimeSpec) {
    if (spec.codes.set !== spec.set) {
      throw new Error(
        `ScreenRuntime: загрузчики кода набора ${spec.codes.set.name}, а исполнитель — ${spec.set.name}`,
      );
    }
    this.spec = spec;
    this.ids = new UiIds(spec.set);
    this.codec = new AddressCodec(spec.set);
  }

  /** Новый экземпляр по адресу; отказ загрузки — в его виде. */
  open(address: Address, options: OpenOptions): Promise<ScreenInstance> {
    return this.start(address, options, undefined, 0);
  }

  /**
   * Экземпляр из снимка канала (внешние данные): адрес не восстановлен —
   * отказ, состояние не по схеме — начальное.
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
    const state = 'state' in snapshot ? snapshot.state : undefined;
    const revision =
      'revision' in snapshot &&
      typeof snapshot.revision === 'number' &&
      Number.isInteger(snapshot.revision) &&
      snapshot.revision >= 0
        ? snapshot.revision
        : 0;
    return ok(await this.start(address.value, options, state, revision));
  }

  private async start(
    address: Address,
    { context, trace }: OpenOptions,
    state: unknown,
    revision: number,
  ): Promise<ScreenInstance> {
    const { codes, ucs, refresh, observer } = this.spec;
    const unit = await codes.screen(address.screen);
    return ScreenInstance.start(
      {
        unit,
        address,
        ids: this.ids,
        codec: this.codec,
        context,
        ucs,
        refresh,
        observer,
      },
      { trace, state, revision },
    );
  }
}
