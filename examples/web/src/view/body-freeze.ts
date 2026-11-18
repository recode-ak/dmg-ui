import type {
  ActionModel,
  FormModel,
  ScreenBody,
  TaskRowModel,
} from './region-model.types';

/** Отключает всё управление тела: строки, перетаскивание, зону, кнопки, формы. */
export class BodyFreeze {
  freeze(body: ScreenBody): ScreenBody {
    switch (body.kind) {
      case 'list':
        return {
          ...body,
          rows: this.rows(body.rows),
          actions: this.actions(body.actions),
          forms: this.forms(body.forms),
        };
      case 'card':
        return {
          ...body,
          draggable: false,
          dropEnabled: false,
          actions: this.actions(body.actions),
          forms: this.forms(body.forms),
        };
      case 'assigned':
        return { ...body, rows: this.rows(body.rows) };
    }
  }

  private rows(rows: readonly TaskRowModel[]): TaskRowModel[] {
    return rows.map((row) => ({ ...row, selectable: false, openable: false }));
  }

  private actions(actions: readonly ActionModel[]): ActionModel[] {
    return actions.map((action) => ({ ...action, enabled: false }));
  }

  private forms(forms: readonly FormModel[]): FormModel[] {
    return forms.map((form) => ({ ...form, enabled: false }));
  }
}
