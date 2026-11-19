import { type ActionField, FieldInput } from 'dmg-ui';
import type { PageFormValues } from '../view/page-form.types';

/**
 * Вход формой страницы: все поля действия разом — один `act` или
 * `local`, замечания `rejected` — по всем полям. Поле с вариантами —
 * значение варианта по подписи (варианты побеждают приведение), иначе строка
 * приводится к виду поля `FieldInput` ядра: число — числом, остальное как есть
 * (проверит схема); пустое необязательное, незаполненное и чужое поле
 * опускаются.
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
    return choice === undefined
      ? new FieldInput(field).value(raw)
      : choice.value;
  }
}
