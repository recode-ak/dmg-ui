import {
  type ActionField,
  type AnyScreenDef,
  type InstanceView,
  UiIds,
} from 'dmg-ui';
import type {
  FormattedText,
  Message,
  MessageOption,
} from '../message/message.types';
import { TextBuilder } from '../message/text-builder';
import type { ChatViews } from '../view/chat-views';
import { type ComposedScreen, ScreenComposer } from '../view/screen-composer';
import { VIEW_TEXTS } from '../view/view.const';
import type { ViewOption } from '../view/view.types';
import type { Layout, RefTarget, Serial } from './conversation.types';
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
 * Показ беседы: показ вида (`ComposedScreen`), вопрос поля, заметка и
 * подтверждение → `Message` со ссылками таблицы. Варианты-намерения вида
 * становятся ссылками; у вопроса — варианты поля и «Пропустить». Сверх
 * лимита — страницы с «Ещё» у вариантов последнего сообщения или номера в
 * тексте вопроса (`OptionLayout`).
 */
export class ConversationReplies {
  private readonly ids: UiIds;

  constructor(
    views: ChatViews,
    private readonly refs: RefTable,
    private readonly layout: OptionLayout,
  ) {
    this.ids = new UiIds(views.set);
  }

  /** Показ вида экрана `serial` на странице `page`; `lead` — заметка перед видом в первом сообщении, в показанное не входит. */
  screen(
    composed: ComposedScreen,
    view: InstanceView,
    serial: Serial,
    lead?: string,
    page = 0,
  ): readonly Message[] {
    const last = composed.messages.length - 1;
    return composed.messages.map((message, i) =>
      this.message(
        i === 0 ? ScreenComposer.lead(lead, message.text) : message.text,
        i === last ? this.options(message.options, view, serial, page) : [],
      ),
    );
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
    const ask = ConversationReplies.field(field, note);
    if (layout.kind === 'numbers') {
      const lines = page.map(
        (choice, i) => `${slice.start + i + 1}. ${choice.label}`,
      );
      return this.text(ConversationReplies.join([ask, lines.join('\n')]), [
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
    return this.text(ask, [
      ...buttons,
      ...skip,
      ...this.more(slice, 'field', draft.serial()),
    ]);
  }

  /** Заметка без вариантов. */
  note(text: string): Message {
    return this.text(text, []);
  }

  /** Текст выхода из Def экрана: подпись и описание. */
  exit(view: InstanceView, exit: string): string {
    const def = this.def(view.screen);
    const found = Object.entries(def.exits).find(
      ([name]) => name === exit,
    )?.[1];
    if (found === undefined) {
      throw new Error(
        `ConversationReplies: у экрана ${view.screen} нет выхода ${exit}`,
      );
    }
    return ConversationReplies.join([found.label, found.description]);
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
    return this.text(ConversationReplies.join([label, description]), [
      entry(true, VIEW_TEXTS.yes),
      entry(false, VIEW_TEXTS.no),
    ]);
  }

  /** Варианты последнего сообщения вида: страница раскладки и «Ещё». */
  private options(
    options: readonly ViewOption[],
    view: InstanceView,
    serial: Serial,
    page: number,
  ): MessageOption[] {
    const slice = ConversationReplies.slice(
      this.layout.of(options.length, 0, false),
      options.length,
      page,
    );
    return [
      ...options
        .slice(slice.start, slice.end)
        .map((option) =>
          this.option(option.label, this.target(view, serial, option)),
        ),
      ...this.more(slice, 'screen', serial),
    ];
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
      case 'home':
        return { kind: 'home', label: option.label };
      case 'back':
        return { kind: 'back', screen, label: option.label };
      default: {
        const unknownKind: never = option;
        throw new Error(
          `неизвестный вид варианта: ${(unknownKind as ViewOption).kind}`,
        );
      }
    }
  }

  private skip(draft: InputDraft, field: ActionField): MessageOption {
    return this.option(VIEW_TEXTS.skip, {
      kind: 'skip',
      draft: draft.serial(),
      field: field.name,
      label: VIEW_TEXTS.skip,
    });
  }

  /** «Ещё» — следующая страница по кругу; страница одна — кнопки нет. */
  private more(
    slice: PageSlice,
    of: 'screen' | 'field',
    owner: Serial,
  ): MessageOption[] {
    if (slice.next === undefined) return [];
    const label = VIEW_TEXTS.more;
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

  /** Строка без стилей — в сообщение. */
  private text(text: string, options: readonly MessageOption[]): Message {
    return this.message(TextBuilder.of(text), options);
  }

  /** Единственное место, где беседа строит `Message`: текст и варианты со ссылками. */
  private message(
    text: FormattedText,
    options: readonly MessageOption[],
  ): Message {
    return { kind: 'text', text, options };
  }

  /** Вопрос поля входа; `note` — замечание перед ним (отвергнутый вход). */
  private static field(field: ActionField, note?: string): string {
    const ask = field.choices === undefined ? 'Введите' : 'Выберите';
    return ConversationReplies.join([note, `${ask}: ${field.label}`]);
  }

  /** Части текста через пустую строку; пустые части опускаются. */
  private static join(parts: readonly (string | undefined)[]): string {
    return parts
      .filter((part) => part !== undefined && part !== '')
      .join('\n\n');
  }

  private def(screen: string): AnyScreenDef {
    const def = this.ids.findScreen(screen);
    if (def === undefined) {
      throw new Error(`ConversationReplies: экран ${screen} вне набора`);
    }
    return def;
  }
}
