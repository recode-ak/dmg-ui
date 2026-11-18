import * as v from 'valibot';
import type { PageSlotJson, PageSnapshot } from './page-client.types';
import {
  PAGE_HISTORY_VERSION,
  PAGE_RECORD_LIMIT,
  PAGE_SLOT_LIMIT,
} from './page-history.const';

/** Форма записи: версия и слоты; слоты проверяются отдельно. */
const RecordJson = v.object({
  version: v.literal(PAGE_HISTORY_VERSION),
  regions: v.unknown(),
});

/** Слоты под именами областей — как есть. */
const RegionsJson = v.record(v.string(), v.unknown());

/**
 * Запись истории вкладки — строка JSON `{"version":1,"regions":{…}}` со
 * слотами снимка областей (D-UI-81). Объект, а не класс: преобразование без
 * состояния (biome `noStaticOnlyClass`). Чтение не бросает: слоты отдаются
 * как есть — их проверит `ScreenRuntime.restore`.
 * @see ./page-history-record.test.ts
 */
export const PageHistoryRecord = {
  /** Слот длиннее `PAGE_SLOT_LIMIT` не пишется; итог по построению не длиннее `PAGE_RECORD_LIMIT`. */
  write(snapshot: PageSnapshot): string {
    const regions: Record<string, PageSlotJson> = {};
    for (const [name, slot] of Object.entries(snapshot)) {
      if (
        slot !== undefined &&
        JSON.stringify(slot).length <= PAGE_SLOT_LIMIT
      ) {
        regions[name] = slot;
      }
    }
    return JSON.stringify({ version: PAGE_HISTORY_VERSION, regions });
  },

  /** Не строка, длиннее предела, не JSON, не по форме — пустой набор. */
  read(record: unknown): Readonly<Record<string, unknown>> {
    if (typeof record !== 'string' || record.length > PAGE_RECORD_LIMIT) {
      return {};
    }
    let json: unknown;
    try {
      json = JSON.parse(record);
    } catch {
      return {};
    }
    const parsed = v.safeParse(RecordJson, json);
    // `v.record` принимает и массив — как объект с ключами-индексами.
    if (!parsed.success || Array.isArray(parsed.output.regions)) return {};
    const regions = v.safeParse(RegionsJson, parsed.output.regions);
    return regions.success ? regions.output : {};
  },
} as const;
