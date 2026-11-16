import type { Trace } from 'dmg-core';
import {
  type ActionField,
  type ActionOutcome,
  type Address,
  AddressCodec,
  type AddressJson,
  type FieldIssue,
  type InstanceJson,
  type LocalOutcome,
  type ScreenInstance,
  type UnavailableReason,
} from 'dmg-ui';
import type { DeliveredNotification } from 'dmg-ui/server';
import type {
  ActiveDraft,
  ActTarget,
  DialogOption,
  DialogReply,
  DialogSpec,
  DraftTarget,
  RefTarget,
} from './dialog.types';
import { DIALOG_HOME } from './dialog-channel.const';
import { DIALOG_TEXTS } from './dialog-replies';
import { InputDraft } from './input-draft';
import { RefTable } from './ref-table';

/**
 * Диалог одной личности: один живой экземпляр экрана, короткие ссылки
 * вариантов и вход действия по шагам. Входящие сигналы — `start`, `say`,
 * `press`; выход — реплики `replies` и уведомления `inbox`. Исходы ядра
 * разбирает по таблице политик (таблица политик исходов в гайде `channel-package.md`).
 *
 * Допущения учебного канала (боевой канал решает их сам):
 * - очереди сигналов нет: параллельные `say`/`press` делят живой экран и
 *   черновик, проактивная реплика может встать между вопросом поля и
 *   ответом — сигналы одной личности сериализует вызывающий;
 * - `close` нет: подписка живого экрана не снимается, `RefTable` растёт без
 *   предела и держит закрытые экземпляры;
 * - в реплику отвергнутого входа идёт сообщение схемы как есть — боевой
 *   канал обязан дать свои тексты (не эхо valibot).
 */
export class Dialog {
  readonly replies: DialogReply[] = [];
  readonly inbox: DialogReply[] = [];
  private readonly refs = new RefTable();
  private readonly codec: AddressCodec;
  private live: ScreenInstance | undefined;
  private unlisten: (() => void) | undefined;
  private active: ActiveDraft | undefined;

  constructor(private readonly spec: DialogSpec) {
    this.codec = new AddressCodec(spec.app.set);
  }

  /** Вход приложения UI по имени; неизвестный вход — ошибка канала, бросок. */
  async start(entry: string): Promise<void> {
    const found = this.spec.app.entries[entry];
    if (found === undefined) {
      throw new Error(
        `Dialog: у приложения ${this.spec.app.name} нет входа ${entry}`,
      );
    }
    await this.open(found.address);
  }

  /** Свободный текст: ожидаемому полю или основному действию вида. */
  async say(text: string): Promise<void> {
    if (this.active !== undefined) {
      const { draft } = this.active;
      if (!draft.answer(text)) {
        this.ask(draft, DIALOG_TEXTS.choose);
        return;
      }
      await this.advance();
      return;
    }
    // Основному действию — только если текст заполняет его первое поле:
    // действие без полей случайный текст не запускает.
    const target = this.primary();
    const draft =
      target === undefined ? undefined : new InputDraft(target.fields);
    if (target === undefined || draft === undefined || draft.done()) {
      this.note(DIALOG_TEXTS.choose);
      return;
    }
    if (!draft.answer(text)) {
      this.note(DIALOG_TEXTS.choose);
      return;
    }
    this.active = { draft, target };
    await this.advance();
  }

  /** Нажатие варианта по ссылке; ссылка не выдавалась — реплика, не бросок. */
  async press(ref: string): Promise<void> {
    const target = this.refs.target(ref);
    if (target === undefined) {
      this.note(DIALOG_TEXTS.unknownRef);
      return;
    }
    await this.follow(target);
  }

  /** Снимок живого экземпляра для хранения; экрана нет — ошибка канала. */
  suspend(): InstanceJson {
    return this.instance().snapshot();
  }

  /** Восстановление из снимка (внешние данные); отказ — вход `start`. */
  async resume(json: unknown): Promise<void> {
    const trace = this.spec.traces.next();
    const restored = await this.spec.runtime.restore(json, {
      context: await this.spec.identity.context(trace),
      trace: trace.toJSON(),
    });
    if (!restored.ok) {
      this.note(DIALOG_TEXTS.notRestored);
      await this.start(DIALOG_HOME);
      return;
    }
    this.replace(restored.value);
    this.show(restored.value);
  }

  /** Уведомление во входящие; живой экран не трогает. */
  notify(notification: DeliveredNotification): void {
    this.inbox.push({
      text: this.spec.replies.notification(
        notification.notification,
        notification.data,
      ),
      options: notification.links.map((address) => ({
        ref: this.refs.add({ kind: 'open', address }),
        label: this.spec.replies.link(address),
      })),
    });
  }

  private async follow(target: RefTarget): Promise<void> {
    if (target.kind === 'choice' || target.kind === 'skip') {
      // Ссылка своего шага: тот же черновик и то же поле (у «Пропустить» —
      // необязательное); старая кнопка другого шага поле не заполняет.
      const field = this.active?.draft.current();
      if (
        this.active?.draft !== target.draft ||
        field?.name !== target.field ||
        (target.kind === 'skip' && !field.optional)
      ) {
        // Черновик жив — тот же вопрос заново, с новыми ссылками своего шага.
        if (this.active === undefined) this.note(DIALOG_TEXTS.unavailable);
        else this.ask(this.active.draft, DIALOG_TEXTS.unavailable);
        return;
      }
      if (target.kind === 'choice') target.draft.choose(target.value);
      else target.draft.skip();
      await this.advance();
      return;
    }
    this.active = undefined;
    switch (target.kind) {
      case 'action':
      case 'local':
        this.active = { draft: new InputDraft(target.fields), target };
        await this.advance();
        return;
      case 'confirm':
        if (!target.yes) {
          this.show(target.instance);
          return;
        }
        await this.act(target, target.input, true);
        return;
      case 'open':
        await this.openJson(target.address);
        return;
    }
  }

  /** Следующее поле черновика или, когда вход собран, — одно исполнение. */
  private async advance(): Promise<void> {
    const active = this.active;
    if (active === undefined) return;
    if (!active.draft.done()) {
      this.ask(active.draft);
      return;
    }
    this.active = undefined;
    const input = active.draft.input();
    const raw = Object.keys(input).length === 0 ? undefined : input;
    if (active.target.kind === 'local') {
      await this.local(active.target, raw, active);
    } else {
      await this.act(active.target, raw, false, active);
    }
  }

  private async act(
    target: ActTarget,
    input: unknown,
    confirmed: boolean,
    draft?: ActiveDraft,
  ): Promise<void> {
    const trace = this.spec.traces.next();
    const outcome = await target.instance.act({
      action: target.action,
      input,
      revision: target.revision,
      confirmed,
      trace: trace.toJSON(),
    });
    await this.settle(target, outcome, input, draft);
  }

  /** Политика по исходу действия. */
  private async settle(
    target: ActTarget,
    outcome: ActionOutcome,
    input: unknown,
    draft: ActiveDraft | undefined,
  ): Promise<void> {
    const { instance } = target;
    switch (outcome.kind) {
      case 'moved':
        await this.openJson(outcome.address);
        return;
      case 'stayed':
        this.show(instance);
        return;
      case 'exited':
        this.note(this.spec.replies.exit(instance.view().screen, outcome.exit));
        await this.start(DIALOG_HOME);
        return;
      case 'confirm': {
        const confirm = { instance, revision: target.revision, input };
        this.push({
          text: this.spec.replies.confirm(outcome.label, outcome.description),
          options: [
            this.option(DIALOG_TEXTS.yes, {
              kind: 'confirm',
              yes: true,
              action: target.action,
              ...confirm,
            }),
            this.option(DIALOG_TEXTS.no, {
              kind: 'confirm',
              yes: false,
              action: target.action,
              ...confirm,
            }),
          ],
        });
        return;
      }
      case 'rejected':
        this.rejected(instance, outcome.issues, draft);
        return;
      case 'refused':
        this.show(
          instance,
          this.spec.replies.refusal(instance.view(), outcome.refusal),
        );
        return;
      case 'stale':
        this.show(instance, DIALOG_TEXTS.stale);
        return;
      case 'unavailable':
        this.unavailable(outcome.reason);
        return;
      default:
        Dialog.unknown(outcome);
    }
  }

  private async local(
    target: Extract<DraftTarget, { kind: 'local' }>,
    input: unknown,
    draft: ActiveDraft,
  ): Promise<void> {
    const outcome: LocalOutcome = await target.instance.local({
      name: target.local,
      input,
    });
    switch (outcome.kind) {
      case 'changed':
        this.show(target.instance);
        return;
      case 'rejected':
        this.rejected(target.instance, outcome.issues, draft);
        return;
      case 'refused':
        this.show(target.instance, outcome.refusal.text);
        return;
      case 'unavailable':
        this.unavailable(outcome.reason);
        return;
      default:
        Dialog.unknown(outcome);
    }
  }

  /** Исход, которого канал не знает (новый в ядре), — дефект канала, бросок (ERR-06). */
  private static unknown(outcome: never): never {
    throw new Error(`Dialog: неизвестный исход ${JSON.stringify(outcome)}`);
  }

  /** Отвергнутый вход: повтор поля из первого замечания с его текстом. */
  private rejected(
    instance: ScreenInstance,
    issues: readonly FieldIssue[],
    draft: ActiveDraft | undefined,
  ): void {
    const [issue] = issues;
    const text = issue?.text ?? DIALOG_TEXTS.unavailable;
    if (
      draft !== undefined &&
      issue?.field !== undefined &&
      draft.draft.repeat(issue.field)
    ) {
      this.active = draft;
      this.ask(draft.draft, text);
      return;
    }
    this.show(instance, text);
  }

  private unavailable(reason: UnavailableReason): void {
    if (reason === 'unknown') {
      throw new Error('Dialog: ссылка на действие, которого нет у экрана');
    }
    this.note(
      reason === 'closed' ? DIALOG_TEXTS.closed : DIALOG_TEXTS.unavailable,
    );
  }

  /** Вопрос текущего поля: варианты поля и «Пропустить» у необязательного. */
  private ask(draft: InputDraft, note?: string): void {
    const field: ActionField | undefined = draft.current();
    if (field === undefined) return;
    const options: DialogOption[] = (field.choices ?? []).map((choice) =>
      this.option(choice.label, {
        kind: 'choice',
        draft,
        field: field.name,
        value: choice.value,
      }),
    );
    if (field.optional) {
      options.push(
        this.option(DIALOG_TEXTS.skip, {
          kind: 'skip',
          draft,
          field: field.name,
        }),
      );
    }
    this.push({ text: this.spec.replies.field(field, note), options });
  }

  /** Адрес из внешних данных (исход `moved`, ссылка): не декодирован — вход `start`. */
  private async openJson(json: AddressJson): Promise<void> {
    const address = this.codec.decode(json);
    if (!address.ok) {
      this.note(DIALOG_TEXTS.notRestored);
      await this.start(DIALOG_HOME);
      return;
    }
    await this.open(address.value);
  }

  private async open(address: Address): Promise<void> {
    const trace: Trace = this.spec.traces.next();
    const instance = await this.spec.runtime.open(address, {
      context: await this.spec.identity.context(trace),
      trace: trace.toJSON(),
    });
    this.replace(instance);
    this.show(instance);
  }

  /** Новый живой экземпляр; прежний закрыт, его слушатель снят. */
  private replace(instance: ScreenInstance): void {
    this.unlisten?.();
    this.live?.close();
    this.active = undefined;
    this.live = instance;
    // Проактивная реплика — только на перечитывание: на `acted` и `local`
    // реплику даёт сам обработчик сигнала.
    this.unlisten = instance.onChange((change) => {
      if (change.cause === 'refreshed' && this.live === instance) {
        this.show(instance);
      }
    });
  }

  /** Реплика с видом экземпляра; `lead` — текст перед видом. */
  private show(instance: ScreenInstance, lead?: string): void {
    const view = instance.view();
    const { replies } = this.spec;
    this.push({
      text: replies.join([lead, replies.screen(view)]),
      options: replies.options(view).map((option) =>
        option.kind === 'retry'
          ? this.option(option.label, { kind: 'open', address: view.address })
          : this.option(
              option.label,
              option.kind === 'action'
                ? {
                    kind: 'action',
                    instance,
                    revision: view.revision,
                    action: option.name,
                    fields: option.fields,
                  }
                : {
                    kind: 'local',
                    instance,
                    local: option.name,
                    fields: option.fields,
                  },
            ),
      ),
    });
  }

  /** Основное действие вида, если оно доступно. */
  private primary(): Extract<DraftTarget, { kind: 'action' }> | undefined {
    const instance = this.live;
    if (instance === undefined) return undefined;
    const view = instance.view();
    const action = view.actions.find(
      (a) => a.name === view.primary && a.available,
    );
    if (action === undefined) return undefined;
    return {
      kind: 'action',
      instance,
      revision: view.revision,
      action: action.name,
      fields: action.fields,
    };
  }

  private option(label: string, target: RefTarget): DialogOption {
    return { ref: this.refs.add(target), label };
  }

  private note(text: string): void {
    this.push({ text, options: [] });
  }

  private push(reply: DialogReply): void {
    this.replies.push(reply);
  }

  private instance(): ScreenInstance {
    if (this.live === undefined) {
      throw new Error('Dialog: живого экрана нет — сначала start или resume');
    }
    return this.live;
  }
}
