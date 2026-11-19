import * as v from 'valibot';
import type { PageSlotJson, PageSnapshot } from './page-client.types';
import {
  PAGE_HISTORY_VERSION,
  PAGE_RECORD_LIMIT,
  PAGE_SLOT_LIMIT,
} from './page-history.const';
import type { PageHistoryMarks } from './page-history.types';

/** Форма записи: версия, слоты и метки; слоты и метки проверяются отдельно. */
const RecordJson = v.object({
  version: v.literal(PAGE_HISTORY_VERSION),
  regions: v.unknown(),
  depth: v.optional(v.unknown()),
  over: v.optional(v.unknown()),
});

/** Слоты под именами областей — как есть. */
const RegionsJson = v.record(v.string(), v.unknown());

/** Глубина — неотрицательное безопасное целое. */
const DepthJson = v.pipe(v.number(), v.safeInteger(), v.minValue(0));

/** Меток нет — запись не своя или прежней формы. */
const NO_MARKS: PageHistoryMarks = { depth: 0, over: false };

/**
 * Разбор внешних данных до формы записи: не строка, длиннее предела, не
 * JSON, не по форме — `undefined`. Функция модуля, а не член объекта: общий
 * шаг `read` и `marks`, наружу не нужен, а закрытых членов у объекта нет.
 */
const parsed = (record: unknown) => {
  if (typeof record !== 'string' || record.length > PAGE_RECORD_LIMIT) {
    return undefined;
  }
  let json: unknown;
  try {
    json = JSON.parse(record);
  } catch {
    return undefined;
  }
  const shape = v.safeParse(RecordJson, json);
  return shape.success ? shape.output : undefined;
};

/**
 * Запись истории вкладки — строка JSON `{"version":1,"regions":{…}}` со
 * слотами снимка областей (D-UI-81) и необязательными метками `depth` и
 * `over` (D-UI-97): умолчания (`0`, ложь) не пишутся, версия та же. Объект, а
 * не класс: преобразование без состояния (biome `noStaticOnlyClass`). Чтение
 * не бросает: слоты отдаются как есть — их проверит `ScreenRuntime.restore`;
 * метка не по форме — её умолчание.
 * @see ./page-history-record.test.ts
 */
export const PageHistoryRecord = {
  /** Слот длиннее `PAGE_SLOT_LIMIT` не пишется; итог по построению не длиннее `PAGE_RECORD_LIMIT`. */
  write(snapshot: PageSnapshot, marks: Partial<PageHistoryMarks> = {}): string {
    const regions: Record<string, PageSlotJson> = {};
    for (const [name, slot] of Object.entries(snapshot)) {
      if (
        slot !== undefined &&
        JSON.stringify(slot).length <= PAGE_SLOT_LIMIT
      ) {
        regions[name] = slot;
      }
    }
    return JSON.stringify({
      version: PAGE_HISTORY_VERSION,
      regions,
      ...(marks.depth ? { depth: marks.depth } : {}),
      ...(marks.over ? { over: true } : {}),
    });
  },

  /** Не строка, длиннее предела, не JSON, не по форме — пустой набор. */
  read(record: unknown): Readonly<Record<string, unknown>> {
    const shape = parsed(record);
    // `v.record` принимает и массив — как объект с ключами-индексами.
    if (shape === undefined || Array.isArray(shape.regions)) return {};
    const regions = v.safeParse(RegionsJson, shape.regions);
    return regions.success ? regions.output : {};
  },

  /** Метки записи: запись не читается — умолчания; метка не по форме — её умолчание. */
  marks(record: unknown): PageHistoryMarks {
    const shape = parsed(record);
    if (shape === undefined) return NO_MARKS;
    const depth = v.safeParse(DepthJson, shape.depth);
    return {
      depth: depth.success ? depth.output : NO_MARKS.depth,
      over: shape.over === true,
    };
  },
} as const;
