import { FieldInput } from 'dmg-ui';
import type { PageForm, PageFormField, PageFormSet } from 'dmg-ui/web-ui';
import type {
  ActionModel,
  FieldBounds,
  FieldModel,
  FormModel,
  ScreenControls,
} from '../../../frontend/web-kit/region-model.types';
import {
  FIELD_HOTKEY,
  FIELD_TEXTS,
  PERSON_FIELD,
} from '../../../frontend/web-kit/view-texts.const';

/**
 * Действия и формы экрана из модели формы пакета: действие без полей — кнопка,
 * с полями — форма. Локальные действия и жесты строк (`open`) в кнопки и формы
 * не идут. Доступность — как её сказала модель пакета.
 */
export class RegionControls {
  constructor(private readonly gestureActions: readonly string[]) {}

  of(set: PageFormSet): ScreenControls {
    const actions: ActionModel[] = [];
    const forms: FormModel[] = [];
    for (const form of set.forms) {
      if (form.kind !== 'action' || this.gestureActions.includes(form.name)) {
        continue;
      }
      if (form.fields.length === 0) {
        actions.push({
          name: form.name,
          label: form.label,
          enabled: form.available,
          ...this.reason(form),
        });
      } else {
        forms.push(this.form(form));
      }
    }
    return { actions, forms };
  }

  private form(form: PageForm): FormModel {
    return {
      kind: form.kind,
      name: form.name,
      label: form.label,
      enabled: form.available,
      ...this.reason(form),
      primary: form.primary,
      fields: form.fields.map((field, index) =>
        form.primary && index === 0
          ? { ...this.field(field), hotkey: FIELD_HOTKEY }
          : this.field(field),
      ),
      issues: form.issues,
    };
  }

  /** Причина — только из вида; пауза (`available: false` без причины) её не имеет. */
  private reason(form: PageForm): { readonly reason?: string } {
    return form.available || form.reason === undefined
      ? {}
      : { reason: form.reason };
  }

  private field(field: PageFormField): FieldModel {
    const base = {
      name: field.name,
      label: field.label,
      value: field.value,
      optional: field.optional,
      issues: field.issues,
    };
    const { choices } = field;
    const [on, off] = choices ?? [];
    const checkbox =
      field.kind === 'boolean' &&
      !field.optional &&
      choices?.length === 2 &&
      on !== undefined &&
      off !== undefined;
    const help = this.help(field, checkbox);
    const withHelp = help === undefined ? base : { ...base, help };
    if (checkbox) {
      return {
        ...withHelp,
        widget: 'checkbox',
        checkbox: { on, off, checked: field.value === on },
      };
    }
    if (choices !== undefined) {
      return { ...withHelp, choices, widget: 'choice' };
    }
    if (field.name === PERSON_FIELD) return { ...withHelp, widget: 'person' };
    if (field.kind === 'number') {
      const bounds = this.bounds(field);
      return {
        ...withHelp,
        widget: 'number',
        ...(bounds === undefined ? {} : { bounds }),
      };
    }
    return { ...withHelp, widget: field.kind === 'date' ? 'date' : 'text' };
  }

  private bounds(field: PageFormField): FieldBounds | undefined {
    const { limits } = field;
    if (limits === undefined) return undefined;
    return {
      ...(limits.min === undefined ? {} : { min: limits.min }),
      ...(limits.max === undefined ? {} : { max: limits.max }),
      step: limits.integer ? 1 : 'any',
    };
  }

  /** Подсказка, пример и пределы через «; »; у чекбокса примера нет. */
  private help(field: PageFormField, checkbox: boolean): string | undefined {
    const limits = new FieldInput(field).limitsText();
    const parts = [
      field.hint,
      field.example === undefined || checkbox
        ? undefined
        : `${FIELD_TEXTS.example}: ${field.example}`,
      limits === undefined ? undefined : `${FIELD_TEXTS.limits}: ${limits}`,
    ].filter((part) => part !== undefined);
    return parts.length === 0 ? undefined : parts.join('; ');
  }
}
