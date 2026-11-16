import type { ActionField } from 'dmg-ui';
import type { PageFormValues } from './page-client.types';

/**
 * Вход формой страницы (Т-3): все поля `ActionView.fields` (или
 * `LocalView.fields`) разом — один `act` или `local`, а значит, замечания
 * `rejected` — сразу по всем полям, а не по первому. У поля с вариантами
 * значение — подпись варианта (как в выпадающем списке), без совпадения —
 * как есть, его проверит схема. Необязательное пустое поле и поле без
 * значения опускаются; значения не своих полей — тоже.
 *
 * Допущение учебного канала: поля — строки; число и дату форма не
 * разбирает, их отвергнет схема ядра.
 */
export class PageForms {
  /** Вход по полям формы; у действия без полей входа нет (`undefined`). */
  input(fields: readonly ActionField[], values: PageFormValues): unknown {
    if (fields.length === 0) return undefined;
    const input: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.name];
      if (raw === undefined || (raw === '' && field.optional)) continue;
      input[field.name] = this.value(field, raw);
    }
    return input;
  }

  private value(field: ActionField, raw: string): unknown {
    const choice = field.choices?.find((c) => c.label === raw);
    return choice === undefined ? raw : choice.value;
  }
}
