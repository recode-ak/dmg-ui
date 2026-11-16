import type { ActionField, InstanceView, Refusal } from 'dmg-ui';
import type { ViewOption } from '../dialog/dialog.types';
import { DIALOG_TEXTS, type DialogReplies } from '../dialog/dialog-replies';
import type { Message, MessageOption } from '../message/message.types';
import { TextBuilder } from '../message/text-builder';
import { CONVERSATION_TEXTS } from './conversation.const';
import type {
  Layout,
  RefTarget,
  ScreenReply,
  Serial,
  ShownOption,
  ShownScreen,
} from './conversation.types';
import type { InputDraft } from './input-draft';
import type { OptionLayout } from './option-layout';
import type { RefTable } from './ref-table';

/** Срез вариантов страницы и номер следующей страницы для «Ещё». */
type PageSlice = {
  readonly start: number;
  readonly end: number;
  readonly next: number | undefined;
};

/** Подтверждаемое действие живого экрана и собранный вход. */
type ConfirmTarget = {
  readonly screen: Serial;
  readonly revision: number;
  readonly action: string;
  readonly input: unknown;
};

/**
 * Показ беседы: вид, вопрос поля, заметка и подтверждение → `Message` со
 * ссылками таблицы. Тексты — строки `DialogReplies` без стилей; варианты
 * вида — действия, локальные действия, «Повторить»; у вопроса — варианты
 * поля и «Пропустить». Сверх лимита — страницы с «Ещё» или номера в тексте
 * (`OptionLayout`). Позже показ заменит реестр представлений.
 */
export class ConversationReplies {
  constructor(
    private readonly replies: DialogReplies,
    private readonly refs: RefTable,
    private readonly layout: OptionLayout,
  ) {}

  /** Вид экрана `serial` на странице `page`; `lead` — заметка перед видом, в показанное не входит. */
  screen(
    view: InstanceView,
    serial: Serial,
    lead?: string,
    page = 0,
  ): ScreenReply {
    const all = this.replies.options(view);
    const slice = ConversationReplies.slice(
      this.layout.of(all.length, 0, false),
      all.length,
      page,
    );
    const options = all
      .slice(slice.start, slice.end)
      .map((option) =>
        this.option(option.label, this.target(view, serial, option)),
      );
    const text = this.replies.join([lead, this.replies.screen(view)]);
    return {
      message: this.message(text, [
        ...options,
        ...this.more(slice, 'screen', serial),
      ]),
      shown: this.shown(view),
    };
  }

  /** Вопрос текущего поля черновика: варианты страницы или номера, «Пропустить», «Ещё»; `note` — замечание перед вопросом. */
  question(draft: InputDraft, note?: string): Message | undefined {
    const field = draft.current();
    if (field === undefined) return undefined;
    const choices = field.choices ?? [];
    const skip = field.optional ? [this.skip(draft, field)] : [];
    const layout = this.layout.of(choices.length, skip.length, true);
    const slice = ConversationReplies.slice(
      layout,
      choices.length,
      draft.shownPage(),
    );
    const page = choices.slice(slice.start, slice.end);
    const ask = this.replies.field(field, note);
    if (layout.kind === 'numbers') {
      const lines = page.map(
        (choice, i) => `${slice.start + i + 1}. ${choice.label}`,
      );
      return this.message(this.replies.join([ask, lines.join('\n')]), [
        ...skip,
        ...this.more(slice, 'field', draft.serial()),
      ]);
    }
    const buttons = page.map((choice) =>
      this.option(choice.label, {
        kind: 'choice',
        draft: draft.serial(),
        field: field.name,
        value: choice.value,
        label: choice.label,
      }),
    );
    return this.message(ask, [
      ...buttons,
      ...skip,
      ...this.more(slice, 'field', draft.serial()),
    ]);
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

  private skip(draft: InputDraft, field: ActionField): MessageOption {
    return this.option(DIALOG_TEXTS.skip, {
      kind: 'skip',
      draft: draft.serial(),
      field: field.name,
      label: DIALOG_TEXTS.skip,
    });
  }

  /** «Ещё» — следующая страница по кругу; страница одна — кнопки нет. */
  private more(
    slice: PageSlice,
    of: 'screen' | 'field',
    owner: Serial,
  ): MessageOption[] {
    if (slice.next === undefined) return [];
    const label = CONVERSATION_TEXTS.more;
    return [
      this.option(label, { kind: 'page', of, owner, page: slice.next, label }),
    ];
  }

  /** Варианты страницы `page` раскладки; номер страницы берётся по кругу. */
  private static slice(layout: Layout, items: number, page: number): PageSlice {
    if (layout.kind === 'all' || layout.count <= 1) {
      return { start: 0, end: items, next: undefined };
    }
    const { size, count } = layout;
    const at = ((page % count) + count) % count;
    const start = at * size;
    return {
      start,
      end: Math.min(start + size, items),
      next: (at + 1) % count,
    };
  }

  private option(label: string, target: RefTarget): MessageOption {
    return { ref: this.refs.add(target), label };
  }

  private message(text: string, options: readonly MessageOption[]): Message {
    return { kind: 'text', text: TextBuilder.of(text), options };
  }
}
