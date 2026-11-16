import type { TraceJson } from 'dmg-core';
import type { ActionOutcome, Refusal } from './outcome.types';
import type { UiObserver, UiRecord } from './ui-observer.types';

/**
 * Записи наблюдателя одного экземпляра. Единственное место, где исход
 * становится записью: от него остаются вид, экран перехода, имя выхода и
 * имена полей — без входа, данных и текстов.
 */
export class InstanceRecords {
  private readonly observer: UiObserver;
  private readonly instance: string;

  constructor(observer: UiObserver, instance: string) {
    this.observer = observer;
    this.instance = instance;
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

  /** Причина — бросок кода: текст из `message` у `Error`, иначе строка. */
  defect(node: string, trace: TraceJson, cause: unknown): void {
    const text = cause instanceof Error ? cause.message : String(cause);
    this.put({ kind: 'defect', node, trace, text });
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
