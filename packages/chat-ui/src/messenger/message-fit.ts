import type { TextLimit } from '../limit/limit.types';
import { TextLength } from '../limit/text-length';
import { TextTrimmer } from '../limit/text-trimmer';
import type {
  FormattedText,
  Message,
  MessageOption,
  TextMessage,
} from '../message/message.types';
import type {
  Fitted,
  LimitCut,
  LimitName,
  MessengerCapabilities,
} from './messenger.types';

/**
 * Подгонка сообщения под возможности мессенджера (D-UI-39): чистая, без лога.
 * Порядок: варианты сверх `options.max` отбрасываются с хвоста; ссылка
 * оставленного варианта длиннее `options.ref` — бросок (дефект общей части);
 * подписи — по `options.label`; текст — по `textWithOptions`, если варианты
 * есть, иначе по `text`. Уложилось — тот же объект и разрезов нет; входное
 * сообщение не меняется.
 */
export class MessageFit {
  constructor(private readonly capabilities: MessengerCapabilities) {}

  /** Сообщение в лимитах и разрезы по порядку: варианты, подписи, текст. */
  message(message: Message): Fitted<Message> {
    switch (message.kind) {
      case 'text':
        return this.textMessage(message);
      default:
        return this.unknownKind(message.kind);
    }
  }

  /** Ответ на нажатие по `pressAnswer`; лимита нет — как есть. */
  answer(text: string): Fitted<string> {
    const limit = this.capabilities.pressAnswer;
    if (limit === undefined) return { value: text, cuts: [] };
    const trimmed = new TextTrimmer(limit).trimString(text);
    if (trimmed === text) return { value: text, cuts: [] };
    const length = new TextLength(limit.unit).ofString(text);
    return { value: trimmed, cuts: [this.cut('pressAnswer', limit, length)] };
  }

  private textMessage(message: TextMessage): Fitted<Message> {
    const cuts: LimitCut[] = [];
    const kept = this.keptOptions(message.options, cuts);
    this.checkRefs(kept);
    const options = kept.map((option, index) =>
      this.fittedOption(option, index, cuts),
    );
    const text = this.fittedText(message.text, options.length > 0, cuts);
    if (cuts.length === 0) return { value: message, cuts };
    return { value: { ...message, text, options }, cuts };
  }

  private keptOptions(
    options: readonly MessageOption[],
    cuts: LimitCut[],
  ): readonly MessageOption[] {
    const { max } = this.capabilities.options;
    if (options.length <= max) return options;
    cuts.push({ limit: 'options', max, length: options.length });
    return options.slice(0, max);
  }

  private checkRefs(options: readonly MessageOption[]): void {
    const max = this.capabilities.options.ref;
    if (options.some((option) => option.ref.length > max))
      throw new Error(`ссылка варианта длиннее ${max} символов`);
  }

  private fittedOption(
    option: MessageOption,
    index: number,
    cuts: LimitCut[],
  ): MessageOption {
    const limit = this.capabilities.options.label;
    const label = new TextTrimmer(limit).trimString(option.label);
    if (label === option.label) return option;
    const length = new TextLength(limit.unit).ofString(option.label);
    cuts.push({ ...this.cut('label', limit, length), index });
    return { ...option, label };
  }

  private fittedText(
    text: FormattedText,
    withOptions: boolean,
    cuts: LimitCut[],
  ): FormattedText {
    const name = withOptions ? 'textWithOptions' : 'text';
    const limit = this.capabilities[name];
    const trimmed = new TextTrimmer(limit).trim(text);
    if (trimmed === text) return text;
    cuts.push(this.cut(name, limit, new TextLength(limit.unit).of(text)));
    return trimmed;
  }

  /** Разрез обрезки: лимит, его предел и единица, исходная длина. */
  private cut(name: LimitName, limit: TextLimit, length: number): LimitCut {
    return { limit: name, max: limit.max, unit: limit.unit, length };
  }

  /** Вид, которого общая часть ещё не знает (ERR-06): в тексте только вид. */
  private unknownKind(kind: never): never {
    throw new Error(`неизвестный вид сообщения: ${String(kind)}`);
  }
}
