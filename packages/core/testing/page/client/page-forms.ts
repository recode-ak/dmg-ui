import type { ActionField } from 'dmg-ui';
import type { PageFormValues } from './page-client.types';

/**
 * Вход формой страницы: все поля действия разом — один `act` или
 * `local`, замечания `rejected` — по всем полям. Поле с вариантами —
 * подпись варианта, без совпадения — как есть (проверит схема); пустое
 * необязательное, незаполненное и чужое поле опускаются. Допущение: поля —
 * строки, число и дату отвергнет схема ядра.
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
