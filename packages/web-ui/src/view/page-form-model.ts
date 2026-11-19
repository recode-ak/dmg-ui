import {
  type ActionField,
  type AnyUiSetDef,
  type FieldIssue,
  UiIds,
  type ViewAvailability,
} from 'dmg-ui';
import type { PageForm, PageFormField, PageFormSet } from './page-form.types';
import type { PageEntered, PageViewState } from './page-view-state.types';

const NONE: PageFormSet = { forms: [], general: [] };

/**
 * Модель формы области: чистая функция состояния — формы действий и
 * локальных действий с подписями из Def, вариантами, значениями и замечаниями
 * по полям. Не бросает и состояние не меняет; тексты замечаний — только для
 * показа текстом.
 * @see ./page-form-model.test.ts
 */
export class PageFormModel {
  private readonly ids: UiIds;

  constructor(set: AnyUiSetDef) {
    this.ids = new UiIds(set);
  }

  of(state: PageViewState): PageFormSet {
    const view = state.view;
    if (state.status !== 'ready' || view === undefined) return NONE;
    const def = this.ids.findScreen(view.screen);
    const offline = state.stale === 'offline';
    // Пока показан ожидаемый итог, действия области ждут ответа (D-UI-84);
    // локальные — нет: они без ревизии и на сервер не идут.
    const expecting = state.expected === true;
    const forms: PageForm[] = [
      ...view.actions.map((action) =>
        this.form(state, 'action', action.name, action.fields, {
          label: def?.actions[action.name]?.label ?? action.name,
          description: def?.actions[action.name]?.description ?? '',
          primary: view.primary === action.name,
          ...this.availability(action.availability, offline || expecting),
          ...(action.confirm === undefined ? {} : { confirm: action.confirm }),
        }),
      ),
      ...view.locals.map((local) =>
        this.form(state, 'local', local.name, local.fields, {
          label: def?.locals[local.name]?.label ?? local.name,
          description: def?.locals[local.name]?.description ?? '',
          primary: false,
          ...this.availability(local.availability, offline),
        }),
      ),
    ];
    const named = forms.some((form) => this.named(state.entered, form));
    return {
      forms,
      general: named ? [] : state.issues.map((issue) => issue.text),
    };
  }

  private form(
    state: PageViewState,
    kind: PageForm['kind'],
    name: string,
    fields: readonly ActionField[],
    head: Pick<
      PageForm,
      'label' | 'description' | 'primary' | 'available' | 'reason' | 'confirm'
    >,
  ): PageForm {
    const entered = this.named(state.entered, { kind, name })
      ? state.entered
      : undefined;
    const issues = entered === undefined ? [] : state.issues;
    const declared = new Set(fields.map((field) => field.name));
    return {
      kind,
      name,
      ...head,
      fields: fields.map((field) => this.field(field, entered, issues)),
      // Замечание к полю, которого у формы нет, не теряется — остаётся у формы.
      issues: issues
        .filter((i) => i.field === undefined || !declared.has(i.field))
        .map((i) => i.text),
    };
  }

  private field(
    field: ActionField,
    entered: PageEntered | undefined,
    issues: readonly FieldIssue[],
  ): PageFormField {
    const typed = entered?.values[field.name];
    return {
      name: field.name,
      label: field.label,
      optional: field.optional,
      kind: field.kind,
      ...(field.hint === undefined ? {} : { hint: field.hint }),
      ...(field.example === undefined ? {} : { example: field.example }),
      ...(field.limits === undefined ? {} : { limits: field.limits }),
      ...(field.choices === undefined
        ? {}
        : { choices: field.choices.map((c) => c.label) }),
      value: typed ?? this.initial(field),
      issues: issues.filter((i) => i.field === field.name).map((i) => i.text),
    };
  }

  /**
   * Доступность формы (D-UI-79, D-UI-98): вид решает, `offline` и ожидание
   * итога только гасят `available`. Причина — текст отключённого из вида;
   * у доступного её нет, своей причины канал не придумывает.
   */
  private availability(
    view: ViewAvailability,
    paused: boolean,
  ): Pick<PageForm, 'available' | 'reason'> {
    if (view.kind === 'disabled')
      return { available: false, reason: view.text };
    return { available: !paused };
  }

  /** Начальное значение: подпись варианта с этим значением, иначе строка из скаляра. */
  private initial(field: ActionField): string {
    const { initial } = field;
    const choice = field.choices?.find((c) => c.value === initial);
    if (choice !== undefined) return choice.label;
    switch (typeof initial) {
      case 'string':
        return initial;
      case 'number':
      case 'boolean':
        return String(initial);
      default:
        return '';
    }
  }

  private named(
    entered: PageEntered | undefined,
    form: Pick<PageForm, 'kind' | 'name'>,
  ): boolean {
    return entered?.kind === form.kind && entered.name === form.name;
  }
}
