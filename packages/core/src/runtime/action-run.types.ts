import type { TraceJson } from 'dmg-core';
import type { AddressCodec } from '../address/address-codec';
import type { AppReach } from '../manifest/app-reach';
import type { RenderContext } from './context.types';
import type { InstanceRecords } from './instance-records';
import type { ActionOutcome } from './outcome.types';
import type { UcPort } from './ports.types';
import type { AnyScreenUnit, ScreenFrame } from './screen-unit.types';
import type { UcCalls } from './uc-calls';

/** Запрос действия от канала: имя, сырой вход, ревизия вида, подтверждение. */
export type ActRequest = {
  readonly action: string;
  readonly input?: unknown;
  readonly revision: number;
  readonly confirmed?: boolean;
  readonly trace: TraceJson;
};

/** Запрос локального действия от канала. */
export type LocalRequest = {
  readonly name: string;
  readonly input?: unknown;
};

/** Всё, что нужно одному исполнению действия; кадр — у готового экземпляра. */
export type ActionRunSpec = {
  readonly unit: AnyScreenUnit;
  readonly frame: ScreenFrame | undefined;
  readonly closed: boolean;
  readonly revision: number;
  readonly context: RenderContext;
  readonly request: ActRequest;
  /** Сборка `UcCall`: модуль UC и причина из следа запроса. */
  readonly calls: UcCalls;
  /** Состав приложения UI: отрезанное действие — как неизвестное. */
  readonly reach: AppReach;
  /** `id` действия — узел записей наблюдателя. */
  readonly actionNode: string;
  readonly ucs: UcPort;
  readonly codec: AddressCodec;
  readonly records: InstanceRecords;
};

/** Конец действия: готовый исход или «перечитать на месте» (исход `stayed`). */
export type ActionEnd =
  | { readonly kind: 'outcome'; readonly outcome: ActionOutcome }
  | { readonly kind: 'stay' };
