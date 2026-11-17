import type { Accent, ViewMessage, ViewOutput } from 'dmg-ui/chat-ui';

/**
 * Правка вывода общего представления для перекрытия под Telegram (D-UI-67):
 * акцент варианту по имени действия и текст сообщения. Вывод не меняется на
 * месте — возвращается новый.
 */
export class AccentedOutput {
  private constructor(private readonly output: ViewOutput) {}

  static of(output: ViewOutput): AccentedOutput {
    return new AccentedOutput(output);
  }

  /** Вариант-действие с этим именем получает акцент; прочие остаются как есть. */
  accent(name: string, accent: Accent): AccentedOutput {
    return this.last((message) => ({
      ...message,
      options: message.options.map((option) =>
        option.kind === 'action' && option.name === name
          ? { ...option, accent }
          : option,
      ),
    }));
  }

  /** Текст последнего сообщения меняет `change`. */
  text(
    change: (text: ViewMessage['text']) => ViewMessage['text'],
  ): AccentedOutput {
    return this.last((message) => ({ ...message, text: change(message.text) }));
  }

  build(): ViewOutput {
    return this.output;
  }

  private last(change: (message: ViewMessage) => ViewMessage): AccentedOutput {
    const messages = 'kind' in this.output ? [this.output] : this.output;
    const head = messages.slice(0, -1);
    const tail = messages.at(-1);
    if (tail === undefined) return this;
    const next = [...head, change(tail)];
    const [only] = next;
    return new AccentedOutput(
      only !== undefined && next.length === 1 ? only : next,
    );
  }
}
