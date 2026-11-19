import type { Trace } from 'dmg-core';
import type {
  ActionOutcome,
  FieldIssue,
  ScreenInstance,
  UnavailableReason,
} from 'dmg-ui';
import type { ScreenComposer } from '../view/screen-composer';
import { CONVERSATION_TEXTS } from './conversation.const';
import type { Serial } from './conversation.types';
import type { ConversationInput } from './conversation-input';
import type { ConversationOutput } from './conversation-output';
import type { ConversationReplies } from './conversation-replies';
import type { ConversationScreens } from './conversation-screens';
import type { ExitHandoff } from './exit-handoff';
import type { InputDraft } from './input-draft';

/** Живой экран, на котором исполняется действие. */
export type OnScreen = {
  readonly serial: Serial;
  readonly instance: ScreenInstance;
};

/** Действие живого экрана: имя, ревизия показа, собранный вход. */
export type ActTarget = {
  readonly action: string;
  readonly revision: number;
  readonly input: unknown;
  readonly confirmed: boolean;
};

/** Части беседы, на которых работают политики исходов. */
type OutcomeParts = {
  readonly screens: ConversationScreens;
  readonly replies: ConversationReplies;
  /** Живое место: шаг подтверждения и реакции на нажатие. */
  readonly output: ConversationOutput;
  /** Текст отказа: у кода из `catches` — текст представления. */
  readonly composer: ScreenComposer;
  /** Черновик беседы — для повтора поля по отвергнутому входу. */
  readonly input: ConversationInput;
  /** Приёмник выхода сторис вне набора UI: спрашивается до любого показа. */
  readonly handoff: ExitHandoff;
};

/**
 * Исполнение действия живого экрана и политика по исходу ядра (D-UI-54,
 * D-UI-90, D-UI-96); таблица исходов — гайд `channel-package.md`, §4. Неизвестный
 * исход — дефект беседы, бросок (ERR-06).
 */
export class ConversationOutcomes {
  constructor(private readonly parts: OutcomeParts) {}

  /** Вход черновика собран: исполнение его цели на живом экране. */
  async run(draft: InputDraft, input: unknown, trace: Trace): Promise<void> {
    const on = await this.parts.screens.onScreen(draft.screen());
    if (on === undefined) return;
    const target = draft.target();
    switch (target.kind) {
      case 'action': {
        const { action, revision } = target;
        const act = { action, revision, input, confirmed: false };
        await this.act(on, act, trace, draft);
        return;
      }
      case 'local':
        // Ревизию локального действия ядро не проверяет — проверяет беседа.
        if (target.revision !== on.instance.view().revision) {
          await this.parts.screens.show(CONVERSATION_TEXTS.stale);
        } else await this.local(on.instance, target.local, input, draft);
        return;
      default: {
        const unknownKind: never = target;
        throw new Error(
          `Conversation: неизвестная цель ${(unknownKind as { readonly kind: string }).kind}`,
        );
      }
    }
  }

  /** Действие живого экрана; `draft` — черновик собранного входа. */
  async act(
    on: OnScreen,
    target: ActTarget,
    trace: Trace,
    draft?: InputDraft,
  ): Promise<void> {
    const outcome = await on.instance.act({
      action: target.action,
      input: target.input,
      revision: target.revision,
      confirmed: target.confirmed,
      trace: trace.toJSON(),
    });
    await this.settle(on, target, outcome, trace, draft);
  }

  /** Локальное действие живого экрана; `draft` — черновик собранного входа. */
  async local(
    instance: ScreenInstance,
    name: string,
    input?: unknown,
    draft?: InputDraft,
  ): Promise<void> {
    const { screens } = this.parts;
    const outcome = await instance.local({ name, input });
    switch (outcome.kind) {
      case 'changed':
        await screens.show();
        return;
      case 'rejected':
        await this.rejected(outcome.issues, draft);
        return;
      case 'refused':
        await screens.show(outcome.refusal.text);
        return;
      case 'unavailable':
        await this.unavailable(outcome.reason);
        return;
      default:
        ConversationOutcomes.unknown(outcome);
    }
  }

  /**
   * Нажатие по отключённому варианту (D-UI-105): ответ по живому виду в
   * момент нажатия, ядро не вызывается. Всё ещё отключено — причина реакцией
   * на нажатие; стало доступно — вид заново с «Экран обновился.» (исполнять
   * по прежней ссылке нельзя); скрыто или пропало — «Действие сейчас
   * недоступно.», прежняя причина не раскрывается.
   */
  async disabled(on: OnScreen, name: string): Promise<void> {
    const { screens, output } = this.parts;
    const view = on.instance.view();
    // Имена действий и локальных на экране не пересекаются — правило графа UI-21.
    const item =
      view.actions.find((action) => action.name === name) ??
      view.locals.find((local) => local.name === name);
    if (item === undefined) {
      await output.react(CONVERSATION_TEXTS.unavailable);
      return;
    }
    const { availability } = item;
    switch (availability.kind) {
      case 'disabled':
        await output.react(availability.text);
        return;
      case 'available':
        await screens.show(CONVERSATION_TEXTS.stale);
        return;
      default: {
        const unknownKind: never = availability;
        throw new Error(
          `Conversation: неизвестный ответ доступности ${(unknownKind as { readonly kind: string }).kind}`,
        );
      }
    }
  }

  /** Политика по исходу действия. */
  private async settle(
    on: OnScreen,
    target: ActTarget,
    outcome: ActionOutcome,
    trace: Trace,
    draft: InputDraft | undefined,
  ): Promise<void> {
    const { screens, replies, output } = this.parts;
    const { instance } = on;
    switch (outcome.kind) {
      case 'moved':
        await screens.openJson(outcome.address, trace);
        return;
      case 'stayed':
        await screens.show();
        return;
      case 'exited': {
        const view = instance.view();
        if (await this.parts.handoff.take(view.screen, outcome, trace)) {
          await screens.release();
        } else {
          const lead = replies.exit(view, outcome.exit);
          await screens.exited(view.screen, outcome.exit, trace, lead);
        }
        return;
      }
      case 'confirm':
        await output.step(
          replies.confirm(outcome.label, outcome.description, {
            screen: on.serial,
            revision: target.revision,
            action: target.action,
            input: target.input,
          }),
        );
        return;
      case 'rejected':
        await this.rejected(outcome.issues, draft);
        return;
      case 'refused':
        await screens.show(
          this.parts.composer.refusal(instance.view(), outcome.refusal),
        );
        return;
      case 'stale':
        await screens.show(CONVERSATION_TEXTS.stale);
        return;
      case 'unavailable':
        await this.unavailable(outcome.reason);
        return;
      default:
        ConversationOutcomes.unknown(outcome);
    }
  }

  /** Отвергнутый вход: повтор поля черновика из первого замечания; иначе вид с текстом замечания. */
  private async rejected(
    issues: readonly FieldIssue[],
    draft: InputDraft | undefined,
  ): Promise<void> {
    if (draft !== undefined && (await this.parts.input.repeat(draft, issues)))
      return;
    await this.parts.screens.show(
      issues[0]?.text ?? CONVERSATION_TEXTS.unavailable,
    );
  }

  private async unavailable(reason: UnavailableReason): Promise<void> {
    if (reason === 'unknown') {
      throw new Error(
        'Conversation: ссылка на действие, которого нет у экрана',
      );
    }
    if (reason === 'closed') await this.parts.output.closed();
    else await this.parts.output.react(CONVERSATION_TEXTS.unavailable);
  }

  /** Исход, которого беседа не знает (новый в ядре), — дефект беседы, бросок (ERR-06); в тексте — только вид. */
  private static unknown(outcome: never): never {
    throw new Error(
      `Conversation: неизвестный исход ${(outcome as { readonly kind: string }).kind}`,
    );
  }
}
