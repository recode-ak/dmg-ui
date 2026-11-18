import { DragPayload } from '../view/drag-payload';
import type { DragKind } from '../view/drag-payload.types';

/**
 * Перетаскивание мышью (HTML5): источник кладёт в перенос полезную нагрузку,
 * цель принимает только свою нагрузку нужного вида. Чужое перетаскивание
 * (текст, файл) цель не принимает: `dragover` без `preventDefault`.
 */
export class DragDom {
  /** Элемент можно тащить: в перенос идёт вид и `uuid` задачи. */
  source(element: HTMLElement, kind: DragKind, taskId: string): void {
    element.addEventListener('dragstart', (event) => {
      const transfer = event.dataTransfer;
      if (transfer === null) return;
      transfer.setData(DragPayload.MIME, DragPayload.encode(kind, taskId));
      transfer.effectAllowed = 'move';
    });
  }

  /** Элемент принимает нагрузку вида `kind`, пока `enabled()`; вид не тот — игнор. */
  target(
    element: HTMLElement,
    kind: DragKind,
    enabled: () => boolean,
    onDrop: (taskId: string) => void,
  ): void {
    const accepts = (event: DragEvent): boolean =>
      enabled() &&
      event.dataTransfer !== null &&
      DragPayload.accepts(Array.from(event.dataTransfer.types));
    const allow = (event: DragEvent): void => {
      if (!accepts(event)) return;
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
    };
    element.addEventListener('dragenter', allow);
    element.addEventListener('dragover', allow);
    element.addEventListener('drop', (event) => {
      if (!accepts(event) || event.dataTransfer === null) return;
      event.preventDefault();
      const dropped = DragPayload.parse(
        event.dataTransfer.getData(DragPayload.MIME),
      );
      if (dropped?.kind === kind) onDrop(dropped.taskId);
    });
  }
}
