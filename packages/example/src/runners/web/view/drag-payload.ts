import * as v from 'valibot';
import type { DragData, DragKind } from './drag-payload.types';

const PAYLOAD = v.strictObject({
  kind: v.picklist(['row', 'card']),
  taskId: v.pipe(v.string(), v.uuid()),
});

/**
 * Полезная нагрузка перетаскивания: собственный тип данных и JSON
 * `{ kind, taskId }`, проверенный схемой. Чужое (текст, файл, ссылка) не
 * принимается. Объект, а не класс: преобразование без состояния (biome
 * `noStaticOnlyClass`).
 */
export const DragPayload = {
  MIME: 'application/x-example-task',

  encode(kind: DragKind, taskId: string): string {
    return JSON.stringify({ kind, taskId });
  },

  /** Разбор строки из переноса; чужое и негодное — `undefined`. */
  parse(raw: string): DragData | undefined {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return undefined;
    }
    const parsed = v.safeParse(PAYLOAD, json);
    return parsed.success ? parsed.output : undefined;
  },

  /** Среди типов переноса есть собственный. */
  accepts(types: readonly string[]): boolean {
    return types.includes(DragPayload.MIME);
  },
} as const;
