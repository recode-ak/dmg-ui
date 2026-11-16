import type { TraceJson } from 'dmg-core';
import { CodeDefect } from '../screen/code-defect';
import type { ActionOutcome, Refusal } from './outcome.types';
import type { UiFault, UiObserver, UiRecord } from './ui-observer.types';

/**
 * Записи наблюдателя одного экземпляра. Единственное место, где исход
 * становится записью: от него остаются вид, экран перехода, имя выхода и
 * имена полей — без входа, данных и текстов.
 */
export class InstanceRecords {
  private readonly observer: UiObserver;
  private readonly instance: string;
  private readonly faults: ((fault: UiFault) => void) | undefined;

  constructor(
    observer: UiObserver,
    instance: string,
    faults: ((fault: UiFault) => void) | undefined,
  ) {
    this.observer = observer;
    this.instance = instance;
    this.faults = faults;
  }

  opened(node: string, trace: TraceJson, revision: number): void {
    this.put({ kind: 'opened', node, trace, revision });
  }

  refreshed(node: string, trace: TraceJson, revision: number): void {
    this.put({ kind: 'refreshed', node, trace, revision });
  }

  acted(node: string, trace: TraceJson, revision: number): void {
    this.put({ kind: 'acted', node, trace, revision });
  }

  outcome(node: string, trace: TraceJson, outcome: ActionOutcome): void {
    this.put({
      kind: 'outcome',
      node,
      trace,
      outcome: outcome.kind,
      ...InstanceRecords.detailsOf(outcome),
    });
  }

  refused(node: string, trace: TraceJson, refusal: Refusal): void {
    const { code, caught } = refusal;
    this.put({ kind: 'refused', node, trace, code, caught });
  }

  /**
   * Дефект кода: в запись — безопасный текст (`CodeDefect.textOf`, `stage` —
   * где бросило), сам бросок — в `faults`.
   */
  defect(node: string, trace: TraceJson, cause: unknown, stage: string): void {
    const text = CodeDefect.textOf(cause, stage);
    this.put({ kind: 'defect', node, trace, text });
    this.fault(node, trace, cause);
  }

  /** Сырой бросок — в точку диагностики; её собственный бросок гасится. */
  fault(node: string, trace: TraceJson, error: unknown): void {
    try {
      this.faults?.({ node, trace, error });
    } catch {
      // Диагностика не рвёт исполнение: сообщить о её сбое некуда.
    }
  }

  private put(entry: UiRecord): void {
    this.observer.record({ ...entry, instance: this.instance });
  }

  private static detailsOf(outcome: ActionOutcome): {
    readonly to?: string;
    readonly exit?: string;
    readonly fields?: readonly string[];
  } {
    switch (outcome.kind) {
      case 'moved':
        return { to: outcome.address.screen };
      case 'exited':
        return { exit: outcome.exit };
      case 'rejected':
        return {
          fields: [
            ...new Set(outcome.issues.flatMap((issue) => issue.field ?? [])),
          ],
        };
      default:
        return {};
    }
  }
}
