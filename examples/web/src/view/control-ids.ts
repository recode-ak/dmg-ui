import type { PageRegionName } from 'dmg-ui/web-ui';

/**
 * Идентификаторы разметки для «причины» и «подсказки». Источник — имена Def и
 * область, строк людей нет; уникальны между областями (в «Назначенные мне» и в
 * списке одно и то же `completeSelected`).
 */
export const ControlIds = {
  /** Причина отключённого действия или формы: `reason-<область>-<имя>`. */
  reason: (region: PageRegionName, name: string): string =>
    `reason-${region}-${name}`,

  /** Подсказка поля: `help-<область>-<форма>-<поле>`. */
  help: (region: PageRegionName, form: string, field: string): string =>
    `help-${region}-${form}-${field}`,
} as const;
