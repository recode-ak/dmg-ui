import type { PageForm, PageFormField, PageFormSet } from 'dmg-ui/web-ui';
import type {
  ActionModel,
  FieldModel,
  FormModel,
  ScreenControls,
} from './region-model.types';
import { PERSON_FIELD } from './view-texts.const';

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
      primary: form.primary,
      fields: form.fields.map((field) => this.field(field)),
      issues: form.issues,
    };
  }

  private field(field: PageFormField): FieldModel {
    const base = {
      name: field.name,
      label: field.label,
      value: field.value,
      optional: field.optional,
      issues: field.issues,
    };
    if (field.choices !== undefined) {
      return { ...base, choices: field.choices, widget: 'choice' };
    }
    return { ...base, widget: field.name === PERSON_FIELD ? 'person' : 'text' };
  }
}
