import type { PageRegionName } from 'dmg-ui/web-ui';

/**
 * Идентификаторы разметки для «причины», «подсказки», блока справки и
 * ключ фокуса поля.
 * Источник — имена Def и область, строк людей нет; уникальны между областями
 * (в «Назначенные мне» и в списке одно и то же `completeSelected`).
 */
export const ControlIds = {
  /** Причина отключённого действия или формы: `reason-<область>-<имя>`. */
  reason: (region: PageRegionName, name: string): string =>
    `reason-${region}-${name}`,

  /** Подсказка поля: `help-<область>-<форма>-<поле>`. */
  help: (region: PageRegionName, form: string, field: string): string =>
    `help-${region}-${form}-${field}`,

  /** Ключ фокуса поля формы (`data-focus-key`): `field:<форма>:<поле>`; уникален в области. */
  fieldFocus: (form: string, field: string): string => `field:${form}:${field}`,

  /** Блок справки области: `sheet-<область>`. */
  sheet: (region: PageRegionName): string => `sheet-${region}`,
} as const;
