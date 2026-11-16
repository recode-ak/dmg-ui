import type {
  AnyUseCaseDef,
  OutputOf,
  Result,
  InputOf as UcInputOf,
  UseCaseErrorOf,
} from 'dmg-core';
import type { DeclaredReadsSpec } from './declared-reads.types';

export type { DeclaredReadsSpec } from './declared-reads.types';

/**
 * Чтение экрана или уведомления поверх `UcPort`: только UC из `reads` узла
 * (по идентичности Def) и только query. Нарушение — дефект кода, бросок:
 * его превращает в отказ тот, кто исполняет код.
 */
export class DeclaredReads {
  private readonly spec: DeclaredReadsSpec;

  constructor(spec: DeclaredReadsSpec) {
    this.spec = spec;
  }

  /** `ReadPort` узла; стрелка — чтобы передавать без привязки. */
  readonly read = async <U extends AnyUseCaseDef>(
    uc: U,
    input: UcInputOf<U>,
  ): Promise<Result<OutputOf<U>, UseCaseErrorOf<U>>> => {
    const { owner, node, reads, ucs, trace } = this.spec;
    if (!reads.includes(uc)) {
      throw new Error(`${owner} не объявил UC ${uc.name} в reads`);
    }
    if (uc.type !== 'query') {
      throw new Error(`${owner}: UC ${uc.name} в reads — не query`);
    }
    const wire = await ucs.call({ node, uc: uc.name, input, trace });
    // Ответ восстанавливает Def `uc`, то есть ровно его выход и ошибки;
    // `AnyUseCaseDef` стирает спеку, и TS этого не выводит.
    return uc.restoreResult(wire) as Result<OutputOf<U>, UseCaseErrorOf<U>>;
  };
}
