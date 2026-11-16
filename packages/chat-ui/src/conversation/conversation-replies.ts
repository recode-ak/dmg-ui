import type { InstanceView, Refusal } from 'dmg-ui';
import type { ViewOption } from '../dialog/dialog.types';
import { DIALOG_TEXTS, type DialogReplies } from '../dialog/dialog-replies';
import type { Message, MessageOption } from '../message/message.types';
import { TextBuilder } from '../message/text-builder';
import type {
  RefTarget,
  ScreenReply,
  Serial,
  ShownOption,
  ShownScreen,
} from './conversation.types';
import type { RefTable } from './ref-table';

/** Подтверждаемое действие живого экрана и собранный вход. */
type ConfirmTarget = {
  readonly screen: Serial;
  readonly revision: number;
  readonly action: string;
  readonly input: unknown;
};

/**
 * Показ беседы: вид, заметка и подтверждение → `Message` со ссылками таблицы.
 * Тексты — строки `DialogReplies` одной строкой без стилей; варианты вида —
 * действия, локальные действия, «Повторить»; ссылки ставятся в таблицу
 * беседы. Позже показ заменит реестр представлений.
 */
export class ConversationReplies {
  constructor(
    private readonly replies: DialogReplies,
    private readonly refs: RefTable,
  ) {}

  /** Вид экрана `serial`; `lead` — заметка перед видом, в показанное не входит. */
  screen(view: InstanceView, serial: Serial, lead?: string): ScreenReply {
    const options = this.replies
      .options(view)
      .map((option) =>
        this.option(option.label, this.target(view, serial, option)),
      );
    const text = this.replies.join([lead, this.replies.screen(view)]);
    return { message: this.message(text, options), shown: this.shown(view) };
  }

  /** Показанное без ссылок и без заметки — для отпечатка. */
  shown(view: InstanceView): ShownScreen {
    return {
      text: TextBuilder.of(this.replies.screen(view)),
      options: this.replies
        .options(view)
        .map(
          (option): ShownOption =>
            option.kind === 'retry'
              ? { kind: 'retry', label: option.label }
              : { kind: option.kind, name: option.name, label: option.label },
        ),
    };
  }

  /** Заметка без вариантов. */
  note(text: string): Message {
    return this.message(text, []);
  }

  /** Текст выхода из Def экрана. */
  exit(view: InstanceView, exit: string): Message {
    return this.note(this.replies.exit(view.screen, exit));
  }

  /** Текст отказа перед видом. */
  refusal(view: InstanceView, refusal: Refusal): string {
    return this.replies.refusal(view, refusal);
  }

  /** Подтверждение действия: «Да» исполняет с собранным входом, «Нет» — вид снова. */
  confirm(label: string, description: string, target: ConfirmTarget): Message {
    const input = target.input === undefined ? {} : { input: target.input };
    const entry = (yes: boolean, text: string) =>
      this.option(text, {
        kind: 'confirm',
        screen: target.screen,
        revision: target.revision,
        action: target.action,
        yes,
        ...input,
        label: text,
      });
    return this.message(this.replies.confirm(label, description), [
      entry(true, DIALOG_TEXTS.yes),
      entry(false, DIALOG_TEXTS.no),
    ]);
  }

  private target(
    view: InstanceView,
    screen: Serial,
    option: ViewOption,
  ): RefTarget {
    const { revision } = view;
    switch (option.kind) {
      case 'action':
        return {
          kind: 'action',
          screen,
          revision,
          action: option.name,
          label: option.label,
        };
      case 'local':
        return {
          kind: 'local',
          screen,
          revision,
          local: option.name,
          label: option.label,
        };
      case 'retry':
        return { kind: 'open', address: view.address, label: option.label };
      default: {
        const unknownKind: never = option;
        throw new Error(
          `неизвестный вид варианта: ${JSON.stringify(unknownKind)}`,
        );
      }
    }
  }

  private option(label: string, target: RefTarget): MessageOption {
    return { ref: this.refs.add(target), label };
  }

  private message(text: string, options: readonly MessageOption[]): Message {
    return { kind: 'text', text: TextBuilder.of(text), options };
  }
}
