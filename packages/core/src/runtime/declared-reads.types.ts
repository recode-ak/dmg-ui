import type { AnyUseCaseDef, TraceJson } from 'dmg-core';
import type { UcPort } from './ports.types';
import type { UcCalls } from './uc-calls';

/** Чтение одного узла за один след: кто читает, что объявил, через какой порт. */
export type DeclaredReadsSpec = {
  /** Кто читает — для текста дефекта: «Экран taskList», «Уведомление taskAssigned». */
  readonly owner: string;
  /** Сборка `UcCall`: модуль UC и причина из `trace`. */
  readonly calls: UcCalls;
  readonly reads: readonly AnyUseCaseDef[];
  readonly ucs: UcPort;
  readonly trace: TraceJson;
};
