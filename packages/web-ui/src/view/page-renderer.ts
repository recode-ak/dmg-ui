import {
  type ActionField,
  type InstanceView,
  type NotificationPreview,
  UiIds,
} from 'dmg-ui';
import type { PageViews } from './page-views';

/** Тексты страницы: подписи рендера вида (на них опираются снимки) и состояний области. */
export const PAGE_TEXTS = {
  retry: 'Повторить',
  delegate: 'Вы работаете за другого человека',
  readOnly: 'только чтение',
  optional: 'необязательно',
  blank: '____',
  loading: 'Загрузка…',
  refreshing: 'Обновляется…',
  offline: 'Нет связи — переподключаемся',
  confirm: 'Подтвердить',
} as const;

/**
 * Рендер вида и уведомления в текст страницы без клиента, провода и сервера:
 * заголовок, тело представления, формы действий с подписями полей и кнопкой.
 * Подписи — из Def экрана (`UiIds.findScreen`). Реализует порт
 * `ExampleRenderer` помощника рендера примеров.
 */
export class PageRenderer {
  private readonly ids: UiIds;

  constructor(private readonly views: PageViews) {
    this.ids = new UiIds(views.set);
  }

  screen(view: InstanceView): string {
    return this.join([
      `# ${this.ids.findScreen(view.screen)?.label ?? view.screen}`,
      this.header(view),
      ...this.content(view),
    ]);
  }

  notification(preview: NotificationPreview): string {
    return this.views.notification(preview.notification).text(preview.data);
  }

  private content(view: InstanceView): readonly (string | undefined)[] {
    if (view.status === 'refused') {
      return [view.refusal?.text, this.form(PAGE_TEXTS.retry, [])];
    }
    const def = this.ids.findScreen(view.screen);
    return [
      this.views.screen(view.screen).text(view),
      ...view.actions
        .filter((action) => action.available)
        .map((action) =>
          this.form(
            def?.actions[action.name]?.label ?? action.name,
            action.fields,
          ),
        ),
      ...view.locals
        .filter((local) => local.available)
        .map((local) =>
          this.form(def?.locals[local.name]?.label ?? local.name, local.fields),
        ),
    ];
  }

  /** Форма: поля с подписями и кнопка действия. */
  private form(label: string, fields: readonly ActionField[]): string {
    return [
      ...fields.map((field) => `  ${this.field(field)}`),
      `  [${label}]`,
    ].join('\n');
  }

  private field(field: ActionField): string {
    const mark = field.optional ? ` (${PAGE_TEXTS.optional})` : '';
    const input =
      field.choices === undefined
        ? PAGE_TEXTS.blank
        : field.choices.map((choice) => choice.label).join(' | ');
    return `${field.label}${mark}: ${input}`;
  }

  private header(view: InstanceView): string | undefined {
    const { delegate, readOnly } = view.context;
    if (!delegate && !readOnly) return undefined;
    const marks = [
      delegate ? PAGE_TEXTS.delegate : undefined,
      readOnly ? PAGE_TEXTS.readOnly : undefined,
    ].filter((mark) => mark !== undefined);
    return `(${marks.join(', ')})`;
  }

  /** Части через пустую строку; пустые части опускаются. */
  private join(parts: readonly (string | undefined)[]): string {
    return parts
      .filter((part) => part !== undefined && part !== '')
      .join('\n\n');
  }
}
