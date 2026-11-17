import type { Trace } from 'dmg-core';
import type { ActionField, FieldIssue } from 'dmg-ui';
import { DIALOG_TEXTS } from '../dialog/dialog-replies';
import type {
  DraftJson,
  RefEntry,
  Serial,
  StepEntry,
} from './conversation.types';
import type { ConversationReplies } from './conversation-replies';
import type { ConversationScreens } from './conversation-screens';
import { InputDraft } from './input-draft';

/** Части беседы, на которых работает сбор входа. */
type InputParts = {
  readonly screens: ConversationScreens;
  readonly replies: ConversationReplies;
  /** Вход собран: беседа исполняет цель черновика (`input` — `undefined`, если полей не заполнено). */
  readonly run: (
    draft: InputDraft,
    input: unknown,
    trace: Trace,
  ) => Promise<void>;
};

/**
 * Черновик беседы — сбор входа по шагам (D-UI-47): один черновик на живой
 * экран, вопрос текущего поля, шаги по записям таблицы ссылок (вариант,
 * «Пропустить», «Ещё»), свободный текст полю или первому полю основного
 * действия, отмена и повтор поля по отвергнутому входу. Собранный вход
 * исполняет беседа; черновик чужого экрана сбрасывается.
 * @see conversation-input.test.ts
 */
export class ConversationInput {
  private draft: InputDraft | undefined;

  constructor(
    private readonly parts: InputParts,
    json?: DraftJson,
  ) {
    this.draft = json === undefined ? undefined : InputDraft.of(json);
  }

  /** Черновик живого экрана; черновик другого экрана или собранный — сброшен. */
  active(): InputDraft | undefined {
    const draft = this.draft;
    if (draft === undefined) return undefined;
    if (draft.screen() !== this.parts.screens.shownSerial() || draft.done()) {
      this.draft = undefined;
      return undefined;
    }
    return draft;
  }

  /** Начать сбор входа цели экрана `screen` по полям `fields`. */
  async start(
    screen: Serial,
    target: DraftJson['target'],
    fields: readonly ActionField[],
    trace: Trace,
  ): Promise<void> {
    const draft = InputDraft.start(
      this.parts.screens.issue(),
      screen,
      target,
      fields,
    );
    this.draft = draft;
    await this.advance(draft, trace);
  }

  /** Свободный текст: текущему полю, без черновика — первому полю основного действия; иначе «Выберите вариант.». */
  async text(text: string, trace: Trace): Promise<void> {
    const active = this.active();
    if (active !== undefined) {
      if (active.answer(text)) await this.advance(active, trace);
      else await this.ask(active, DIALOG_TEXTS.choose);
      return;
    }
    const draft = this.primary();
    // Действие без полей случайный текст не запускает.
    if (draft === undefined || !draft.answer(text)) {
      await this.parts.screens.note(DIALOG_TEXTS.choose);
      return;
    }
    this.draft = draft;
    await this.advance(draft, trace);
  }

  /** Запись — шаг черновика: вариант поля, «Пропустить» или «Ещё» вариантов поля. */
  static steps(entry: RefEntry): entry is StepEntry {
    return (
      entry.kind === 'choice' ||
      entry.kind === 'skip' ||
      (entry.kind === 'page' && entry.of === 'field')
    );
  }

  /** Шаг по записи `choice`, `skip` или `page` поля; чужой черновик или поле — тот же вопрос с «Действие сейчас недоступно.». */
  async step(entry: StepEntry, trace: Trace): Promise<void> {
    const draft = this.active();
    if (draft === undefined || !ConversationInput.fits(draft, entry)) {
      if (draft === undefined) {
        await this.parts.screens.note(DIALOG_TEXTS.unavailable);
      } else await this.ask(draft, DIALOG_TEXTS.unavailable);
      return;
    }
    switch (entry.kind) {
      case 'choice':
        draft.choose(entry.value);
        await this.advance(draft, trace);
        return;
      case 'skip':
        draft.skip();
        await this.advance(draft, trace);
        return;
      case 'page':
        draft.turn(entry.page);
        await this.ask(draft);
        return;
      default:
        return ConversationInput.notStep(entry);
    }
  }

  /** Запись другого вида (ERR-06): в тексте ничего из записи. */
  private static notStep(entry: never): never {
    throw new Error(`ConversationInput: запись ${String(entry)} — не шаг`);
  }

  /** Отмена: черновик сброшен; был — true. */
  cancel(): boolean {
    const had = this.active() !== undefined;
    this.draft = undefined;
    return had;
  }

  /** Черновик сброшен: собеседник ушёл к другому варианту. */
  drop(): void {
    this.draft = undefined;
  }

  /** Отвергнутый вход: повтор поля из первого замечания с его текстом; не к полю — false. */
  async repeat(
    draft: InputDraft,
    issues: readonly FieldIssue[],
  ): Promise<boolean> {
    const [issue] = issues;
    if (issue?.field === undefined || !draft.repeat(issue.field)) return false;
    this.draft = draft;
    // Текст замечания — данные собеседника: только в его беседу, не в лог.
    await this.ask(draft, issue.text);
    return true;
  }

  /** Вид экрана снимка совпал с показанным: ревизия цели черновика переносится. */
  rebase(serial: Serial, from: number, to: number): void {
    const draft = this.draft;
    if (draft?.screen() === serial) this.draft = draft.rebased(from, to);
  }

  /** Для снимка беседы: черновик живого экрана или экрана снимка. */
  toJSON(): DraftJson | undefined {
    const draft = this.draft;
    if (draft?.screen() !== this.parts.screens.shownSerial()) return undefined;
    return draft?.toJSON();
  }

  /** Следующее поле или, когда вход собран, — одно исполнение. */
  private async advance(draft: InputDraft, trace: Trace): Promise<void> {
    if (!draft.done()) {
      await this.ask(draft);
      return;
    }
    this.draft = undefined;
    const input = draft.input();
    const raw = Object.keys(input).length === 0 ? undefined : input;
    await this.parts.run(draft, raw, trace);
  }

  private async ask(draft: InputDraft, note?: string): Promise<void> {
    const question = this.parts.replies.question(draft, note);
    if (question !== undefined) await this.parts.screens.send(question);
  }

  /** Черновик основного действия живого экрана, если оно доступно и у него есть поля. */
  private primary(): InputDraft | undefined {
    const live = this.parts.screens.current();
    if (live === undefined) return undefined;
    const view = live.instance.view();
    const action = view.actions.find(
      (a) => a.name === view.primary && a.available,
    );
    if (action === undefined || action.fields.length === 0) return undefined;
    return InputDraft.start(
      this.parts.screens.issue(),
      live.serial,
      { kind: 'action', action: action.name, revision: view.revision },
      action.fields,
    );
  }

  /** Запись — шаг этого черновика и его текущего поля; «Пропустить» — только у необязательного. */
  private static fits(draft: InputDraft, entry: StepEntry): boolean {
    const field = draft.current();
    switch (entry.kind) {
      case 'choice':
        return entry.draft === draft.serial() && entry.field === field?.name;
      case 'skip':
        return (
          entry.draft === draft.serial() &&
          entry.field === field?.name &&
          field.optional
        );
      case 'page':
        return entry.owner === draft.serial();
      default: {
        const unknownKind: never = entry;
        return unknownKind;
      }
    }
  }
}
