import type { TraceJson } from 'dmg-core';
import type { Address } from '../address/address';
import type { AddressCodec } from '../address/address-codec';
import type { UiIds } from '../address/ui-ids';
import type { AppReach } from '../manifest/app-reach';
import type { RenderContext } from './context.types';
import type { Refusal } from './outcome.types';
import type { RefreshPort, UcPort } from './ports.types';
import type { AnyScreenUnit, UnitPresentation } from './screen-unit.types';
import type { UcCalls } from './uc-calls';
import type { UiFault, UiObserver } from './ui-observer.types';

/** Зависимости экземпляра от исполнителя: юнит, адрес, порты, наблюдатель. */
export type ScreenInstanceSpec = {
  readonly unit: AnyScreenUnit;
  readonly address: Address;
  readonly ids: UiIds;
  readonly codec: AddressCodec;
  readonly context: RenderContext;
  readonly calls: UcCalls;
  /** Состав приложения UI: отрезанные действия не показываются и не исполняются. */
  readonly reach: AppReach;
  readonly ucs: UcPort;
  readonly refresh: RefreshPort;
  readonly observer: UiObserver;
  readonly faults: ((fault: UiFault) => void) | undefined;
};

/** Начало экземпляра: след открытия, сохранённое состояние, прежняя ревизия. */
export type InstanceStart = {
  readonly trace: TraceJson;
  readonly state: unknown;
  readonly revision: number;
};

/** Загруженный экземпляр: данные и вид или отказ. */
export type InstanceLoad =
  | {
      readonly status: 'ready';
      readonly data: unknown;
      readonly state: unknown;
      readonly presentation: UnitPresentation;
    }
  | { readonly status: 'refused'; readonly refusal: Refusal };
