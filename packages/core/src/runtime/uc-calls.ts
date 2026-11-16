import type { AnyUseCaseDef, TraceJson } from 'dmg-core';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import { CodeDefect } from '../screen/code-defect';
import type { UcCall, UcCause } from './ports.types';

/**
 * Сборка `UcCall` исполнителя: модуль UC — по `useCases` модулей
 * доменного приложения набора, причина — из следа канала или сигнала.
 * UC вне приложения и след прогона Job — дефект кода, бросок `CodeDefect`:
 * его превращает в отказ тот, кто исполняет код.
 */
export class UcCalls {
  private readonly modules = new Map<AnyUseCaseDef, string>();

  constructor(set: AnyUiSetDef) {
    for (const module of set.app.modules) {
      for (const uc of module.useCases) this.modules.set(uc, module.name);
    }
  }

  /** Вызов UC `uc` со входом `input` по причине следа `trace`. */
  of(uc: AnyUseCaseDef, input: unknown, trace: TraceJson): UcCall {
    const module = this.modules.get(uc);
    if (module === undefined) {
      throw new CodeDefect(`UC ${uc.name} вне модулей приложения`);
    }
    return { module, uc: uc.name, input, ...UcCalls.causeOf(trace) };
  }

  private static causeOf({ cause }: TraceJson): UcCause {
    switch (cause.kind) {
      case 'request':
        return { requestId: cause.requestId };
      case 'event':
        return { eventId: cause.eventId };
      case 'job':
        throw new CodeDefect(
          `след прогона Job ${cause.job} — не причина вызова UC`,
        );
      default:
        return UcCalls.unknown(cause);
    }
  }

  /** Причина, которой нет в `switch` (новая в `dmg-core`), — дефект, бросок (ERR-06). */
  private static unknown(cause: never): never {
    throw new CodeDefect(`неизвестная причина следа ${JSON.stringify(cause)}`);
  }
}
