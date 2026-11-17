import {
  type AnyScreenDef,
  type InstanceView,
  type Refusal,
  UiIds,
} from 'dmg-ui';
import type { FormattedText } from '../message/message.types';
import { TextBuilder } from '../message/text-builder';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import type { ChatViews } from './chat-views';
import { MAX_VIEW_MESSAGES, VIEW_TEXTS } from './view.const';
import type { ViewMessage, ViewOption } from './view.types';
import { ViewKit } from './view-kit';

/** Показ вида: сообщения без заметки перед видом и ключ истории. */
export type ComposedScreen = {
  readonly messages: readonly ViewMessage[];
  /** Ключ следа в истории как его дало представление; экран без следа — нет. */
  readonly history?: string;
};

/** Подписи действий и локальных действий одного экрана по именам. */
type ScreenLabels = {
  readonly actions: ReadonlyMap<string, string>;
  readonly locals: ReadonlyMap<string, string>;
};

/**
 * Сборщик показа (D-UI-50): вид → сообщения представления без беседы,
 * ссылок и сервера. Варианты по умолчанию — доступные действия, затем
 * локальные (подписи из Def), «Назад» последним при непустом пути; вид в
 * отказе — текст отказа, «Повторить», «Назад», «В начало»; шапка — первым
 * абзацем первого сообщения. Вывод не по правилам — дефект представления.
 * @see screen-composer.test.ts
 */
export class ScreenComposer {
  private readonly ids: UiIds;
  private readonly labels = new Map<string, ScreenLabels>();

  constructor(
    private readonly views: ChatViews,
    private readonly capabilities: MessengerCapabilities,
  ) {
    this.ids = new UiIds(views.set);
  }

  /** `back` — путь не пуст. Дефект представления — бросок с id экрана, без данных вида. */
  compose(view: InstanceView, back: boolean): ComposedScreen {
    if (view.status === 'refused') {
      return { messages: this.headed(view, [this.refused(view, back)]) };
    }
    const presenter = this.views.screen(view.screen);
    const options = this.options(view, back);
    const output = presenter.render(
      view,
      new ViewKit(this.capabilities, options),
    );
    const messages = 'kind' in output ? [output] : output;
    this.check(view.screen, messages, options);
    const history = presenter.history(view);
    const composed = { messages: this.headed(view, messages) };
    return history === undefined ? composed : { ...composed, history };
  }

  /** Текст отказа: у кода из `catches` — текст представления, если он есть. */
  refusal(view: InstanceView, refusal: Refusal): string {
    const own = refusal.caught
      ? this.views.screen(view.screen).caught(refusal.code)
      : undefined;
    return own ?? refusal.text;
  }

  /** Абзац `head` перед текстом — как собрал бы `TextBuilder`; пустые части опускаются. */
  static lead(head: string | undefined, text: FormattedText): FormattedText {
    if (head === undefined || head === '') return text;
    const [first, ...rest] = text;
    if (first === undefined) return TextBuilder.of(head);
    const paragraph = `${head}\n\n`;
    if (first.styles.length === 0 && first.link === undefined) {
      return [{ ...first, text: paragraph + first.text }, ...rest];
    }
    return [...TextBuilder.of(paragraph), ...text];
  }

  /** Вид в отказе: представление не вызывается, ключа истории нет. */
  private refused(view: InstanceView, back: boolean): ViewMessage {
    const text =
      view.refusal === undefined ? '' : this.refusal(view, view.refusal);
    const options: ViewOption[] = [{ kind: 'retry', label: VIEW_TEXTS.retry }];
    if (back) options.push({ kind: 'back', label: VIEW_TEXTS.back });
    options.push({ kind: 'home', label: VIEW_TEXTS.home });
    return { kind: 'text', text: TextBuilder.of(text), options };
  }

  /** Варианты по умолчанию: доступные действия, затем доступные локальные, «Назад» при `back`. */
  private options(view: InstanceView, back: boolean): readonly ViewOption[] {
    const labels = this.labelsOf(view.screen);
    return [
      ...view.actions
        .filter((action) => action.available)
        .map(
          (action): ViewOption => ({
            kind: 'action',
            name: action.name,
            label: labels.actions.get(action.name) ?? action.name,
          }),
        ),
      ...view.locals
        .filter((local) => local.available)
        .map(
          (local): ViewOption => ({
            kind: 'local',
            name: local.name,
            label: labels.locals.get(local.name) ?? local.name,
          }),
        ),
      ...(back ? [{ kind: 'back', label: VIEW_TEXTS.back } as const] : []),
    ];
  }

  /** Проверка вывода: число сообщений, варианты только у последнего и только из вариантов по умолчанию. */
  private check(
    screen: string,
    messages: readonly ViewMessage[],
    defaults: readonly ViewOption[],
  ): void {
    const defect = (reason: string): never => {
      throw new Error(
        `ScreenComposer: представление экрана ${screen} — ${reason}`,
      );
    };
    if (messages.length === 0) defect('пустой вывод');
    if (messages.length > MAX_VIEW_MESSAGES) {
      defect(`сообщений больше ${MAX_VIEW_MESSAGES}`);
    }
    if (messages.slice(0, -1).some((message) => message.options.length > 0)) {
      defect('варианты не у последнего сообщения');
    }
    const allowed = new Set(defaults.map(ScreenComposer.key));
    const used = new Set<string>();
    for (const option of messages.at(-1)?.options ?? []) {
      const key = ScreenComposer.key(option);
      if (!allowed.has(key)) defect('вариант не из вариантов по умолчанию');
      if (used.has(key)) defect('повтор варианта');
      if (option.label === '') defect('пустая подпись варианта');
      used.add(key);
    }
  }

  /** Имя цели варианта — для сверки и отпечатка; у «Назад», «Повторить», «В начало» имени нет. */
  static target(option: ViewOption): string | undefined {
    switch (option.kind) {
      case 'action':
      case 'local':
        return option.name;
      case 'back':
      case 'retry':
      case 'home':
        return undefined;
      default: {
        const unknownKind: never = option;
        throw new Error(
          `ScreenComposer: неизвестный вид варианта ${(unknownKind as ViewOption).kind}`,
        );
      }
    }
  }

  /** Сверка варианта: вид и имя цели; подпись не входит. */
  private static key(option: ViewOption): string {
    const target = ScreenComposer.target(option);
    return target === undefined ? option.kind : `${option.kind}:${target}`;
  }

  /** Шапка заместителя и «только чтение» — первым абзацем первого сообщения. */
  private headed(
    view: InstanceView,
    messages: readonly ViewMessage[],
  ): readonly ViewMessage[] {
    const header = this.header(view);
    if (header === undefined) return messages;
    return messages.map((message, i) =>
      i === 0
        ? { ...message, text: ScreenComposer.lead(header, message.text) }
        : message,
    );
  }

  private header(view: InstanceView): string | undefined {
    const { delegate, readOnly } = view.context;
    if (!delegate && !readOnly) return undefined;
    const marks = [
      delegate ? VIEW_TEXTS.delegate : undefined,
      readOnly ? VIEW_TEXTS.readOnly : undefined,
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
      throw new Error(`ScreenComposer: экран ${screen} вне набора`);
    }
    return def;
  }
}
