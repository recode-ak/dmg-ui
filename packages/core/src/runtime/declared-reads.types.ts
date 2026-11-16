import type { AnyUseCaseDef, TraceJson } from 'dmg-core';
import type { UcPort } from './ports.types';

/** Чтение одного узла за один след: кто читает, что объявил, через какой порт. */
export type DeclaredReadsSpec = {
  /** Кто читает — для текста дефекта: «Экран taskList», «Уведомление taskAssigned». */
  readonly owner: string;
  /** `id` узла графа — `UcCall.node`. */
  readonly node: string;
  readonly reads: readonly AnyUseCaseDef[];
  readonly ucs: UcPort;
  readonly trace: TraceJson;
};
