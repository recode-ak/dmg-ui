import {
  type ActionField,
  type AddressJson,
  type AnyScreenDef,
  type InstanceView,
  type Refusal,
  UiIds,
} from 'dmg-ui';
import type { ViewOption } from './dialog.types';
import type { DialogViews } from './dialog-views';

/** Тексты канала, на которые опираются политики исходов. */
export const DIALOG_TEXTS = {
  stale: 'Экран обновился.',
  closed: 'Экран уже закрыт.',
  unavailable: 'Действие сейчас недоступно.',
  choose: 'Выберите вариант.',
  unknownRef: 'Такого варианта нет.',
  notRestored: 'Прежний экран не восстановлен — начнём сначала.',
  yes: 'Да',
  no: 'Нет',
  retry: 'Повторить',
  skip: 'Пропустить',
  open: 'Открыть',
  delegate: 'Вы работаете за другого человека',
  readOnly: 'только чтение',
} as const;

/** Подписи действий и локальных действий одного экрана по именам. */
type ScreenLabels = {
  readonly actions: ReadonlyMap<string, string>;
  readonly locals: ReadonlyMap<string, string>;
};

/**
 * Сборка нейтральных реплик без ссылок: текст вида (шапка и тело
 * представления), варианты вида с подписями из Def, тексты выхода,
 * уведомления, поля входа. Ссылки к вариантам ставит диалог.
 */
export class DialogReplies {
  private readonly ids: UiIds;
  private readonly labels = new Map<string, ScreenLabels>();

  constructor(private readonly views: DialogViews) {
    this.ids = new UiIds(views.set);
  }

  /** Текст вида: шапка и тело представления; у отказа — текст отказа. */
  screen(view: InstanceView): string {
    const body =
      view.status === 'refused' && view.refusal !== undefined
        ? this.refusal(view, view.refusal)
        : this.views.screen(view.screen).text(view);
    return this.join([this.header(view), body]);
  }

  /** Текст отказа: у кода из `catches` — текст представления, если он есть. */
  refusal(view: InstanceView, refusal: Refusal): string {
    const own = refusal.caught
      ? this.views.screen(view.screen).caught(refusal.code)
      : undefined;
    return own ?? refusal.text;
  }

  /** Доступные действия и локальные действия вида; у отказа — «Повторить». */
  options(view: InstanceView): readonly ViewOption[] {
    if (view.status === 'refused') {
      return [{ kind: 'retry', label: DIALOG_TEXTS.retry }];
    }
    const labels = this.labelsOf(view.screen);
    return [
      ...view.actions
        .filter((action) => action.available)
        .map(
          (action): ViewOption => ({
            kind: 'action',
            name: action.name,
            label: labels.actions.get(action.name) ?? action.name,
            fields: action.fields,
          }),
        ),
      ...view.locals
        .filter((local) => local.available)
        .map(
          (local): ViewOption => ({
            kind: 'local',
            name: local.name,
            label: labels.locals.get(local.name) ?? local.name,
            fields: local.fields,
          }),
        ),
    ];
  }

  /** Текст выхода из Def экрана: подпись и описание. */
  exit(screen: string, exit: string): string {
    const found = Object.entries(this.def(screen).exits).find(
      ([name]) => name === exit,
    )?.[1];
    if (found === undefined) {
      throw new Error(`DialogReplies: у экрана ${screen} нет выхода ${exit}`);
    }
    return this.join([found.label, found.description]);
  }

  /** Текст уведомления по его `id` и данным. */
  notification(id: string, data: unknown): string {
    return this.views.notification(id).text(data);
  }

  /** Подпись ссылки уведомления — подпись экрана цели. */
  link(address: AddressJson): string {
    return this.ids.findScreen(address.screen)?.label ?? DIALOG_TEXTS.open;
  }

  /** Вопрос поля входа; `note` — замечание перед ним (отвергнутый вход). */
  field(field: ActionField, note?: string): string {
    const ask = field.choices === undefined ? 'Введите' : 'Выберите';
    return this.join([note, `${ask}: ${field.label}`]);
  }

  /** Подтверждение действия: подпись и описание. */
  confirm(label: string, description: string): string {
    return this.join([label, description]);
  }

  /** Текст и подписи вариантов — одной строкой текста (рендерер, снимки). */
  plain(text: string, labels: readonly string[]): string {
    return this.join([text, labels.map((label) => `[${label}]`).join(' ')]);
  }

  /** Части реплики через пустую строку; пустые части опускаются. */
  join(parts: readonly (string | undefined)[]): string {
    return parts
      .filter((part) => part !== undefined && part !== '')
      .join('\n\n');
  }

  private header(view: InstanceView): string | undefined {
    const { delegate, readOnly } = view.context;
    if (!delegate && !readOnly) return undefined;
    const marks = [
      delegate ? DIALOG_TEXTS.delegate : undefined,
      readOnly ? DIALOG_TEXTS.readOnly : undefined,
    ].filter((mark) => mark !== undefined);
    return `(${marks.join(', ')})`;
  }

  /** Подписи действий и локальных действий — из Def экрана (`UiIds.findScreen`). */
  private labelsOf(screen: string): ScreenLabels {
    const cached = this.labels.get(screen);
    if (cached !== undefined) return cached;
    const def = this.def(screen);
    const labels: ScreenLabels = {
      actions: new Map(
        Object.entries(def.actions).map(([name, spec]) => [name, spec.label]),
      ),
      locals: new Map(
        Object.entries(def.locals).map(([name, spec]) => [name, spec.label]),
      ),
    };
    this.labels.set(screen, labels);
    return labels;
  }

  private def(screen: string): AnyScreenDef {
    const def = this.ids.findScreen(screen);
    if (def === undefined) {
      throw new Error(`DialogReplies: экран ${screen} вне набора`);
    }
    return def;
  }
}
