import type { Trace } from 'dmg-core';
import type {
  ActionOutcome,
  FieldIssue,
  ScreenInstance,
  UnavailableReason,
} from 'dmg-ui';
import { DIALOG_TEXTS } from '../dialog/dialog-replies';
import type { Serial } from './conversation.types';
import type { ConversationInput } from './conversation-input';
import type { ConversationReplies } from './conversation-replies';
import type { ConversationScreens } from './conversation-screens';
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
  /** Черновик беседы — для повтора поля по отвергнутому входу. */
  readonly input: ConversationInput;
};

/**
 * Исполнение действия живого экрана и политика по исходу ядра (таблица
 * политик исходов — гайд `channel-package.md`): переход, вид снова, выход
 * во вход «в начало», подтверждение, отказ, отвергнутый вход с повтором
 * поля черновика. Неизвестный исход — дефект беседы, бросок (ERR-06).
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
          await this.parts.screens.show(DIALOG_TEXTS.stale);
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

  /** Политика по исходу действия. */
  private async settle(
    on: OnScreen,
    target: ActTarget,
    outcome: ActionOutcome,
    trace: Trace,
    draft: InputDraft | undefined,
  ): Promise<void> {
    const { screens, replies } = this.parts;
    const { instance } = on;
    switch (outcome.kind) {
      case 'moved':
        await screens.openJson(outcome.address, trace);
        return;
      case 'stayed':
        await screens.show();
        return;
      case 'exited':
        await screens.send(replies.exit(instance.view(), outcome.exit));
        await screens.home(trace);
        return;
      case 'confirm':
        await screens.send(
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
        await screens.show(replies.refusal(instance.view(), outcome.refusal));
        return;
      case 'stale':
        await screens.show(DIALOG_TEXTS.stale);
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
    await this.parts.screens.show(issues[0]?.text ?? DIALOG_TEXTS.unavailable);
  }

  private async unavailable(reason: UnavailableReason): Promise<void> {
    if (reason === 'unknown') {
      throw new Error(
        'Conversation: ссылка на действие, которого нет у экрана',
      );
    }
    await this.parts.screens.note(
      reason === 'closed' ? DIALOG_TEXTS.closed : DIALOG_TEXTS.unavailable,
    );
  }

  /** Исход, которого беседа не знает (новый в ядре), — дефект беседы, бросок (ERR-06); в тексте — только вид. */
  private static unknown(outcome: never): never {
    throw new Error(
      `Conversation: неизвестный исход ${(outcome as { readonly kind: string }).kind}`,
    );
  }
}
