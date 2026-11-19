import type { AwaitingBus } from 'dmg-core/testing';
import type { ExampleUser } from 'dmg-core/testing/example';
import {
  type ConversationSignal,
  type Conversations,
  PlainText,
} from 'dmg-ui/chat-ui';
import type { MemoryMessenger } from 'dmg-ui/chat-ui/testing';

/** Собеседник беседы: чат на мессенджере и отправитель сигналов. */
export type Who = { readonly peer: string; readonly sender: string };

/** Подпись варианта, открывающего выбор задачи полем. */
const TOGGLE = 'Отметить задачу';

/**
 * Человек в беседе приёмки: что он видит (живое место, подписи вариантов,
 * текст) и что делает (вход, нажатие, текст). Знает только свой чат и свой
 * номер сигнала; мир, сервер и домен ему не видны.
 */
export class DialogPerson {
  private ids = 0;

  constructor(
    private readonly uuid: string,
    private readonly who: Who,
    private readonly conversations: Conversations<ExampleUser>,
    private readonly messenger: MemoryMessenger,
    private readonly bus: AwaitingBus,
  ) {}

  /** Голова сигнала: уникальный id и отправитель; номер растёт с каждым. */
  private head() {
    this.ids += 1;
    return { id: `s-${this.uuid}-${this.ids}`, ...this.who };
  }

  /** Живое место беседы: последнее неушедшее сообщение с вариантами. */
  private live() {
    return [...this.messenger.chat(this.who.peer)]
      .reverse()
      .find((line) => !line.retired && line.message.options.length > 0);
  }

  /** Подписи вариантов живого места. */
  labels(): string[] {
    return this.live()?.message.options.map((o) => o.label) ?? [];
  }

  enter(entry: string): Promise<void> {
    return this.conversations.receive({ ...this.head(), kind: 'enter', entry });
  }

  say(text: string): Promise<void> {
    return this.conversations.receive({ ...this.head(), kind: 'text', text });
  }

  /** Нажатие варианта `label` живого места; нет варианта — ошибка сцены. */
  async press(label: string): Promise<void> {
    const option = this.live()?.message.options.find((o) => o.label === label);
    if (option === undefined) throw new Error(`нет варианта «${label}»`);
    await this.send({
      ...this.head(),
      kind: 'press',
      ref: option.ref,
      press: `p-${this.ids}`,
    });
  }

  /** Подтверждение «Да», если экран его потребовал. */
  async confirm(): Promise<void> {
    if (this.live()?.message.options.some((o) => o.label === 'Да') !== true) {
      return;
    }
    await this.press('Да');
  }

  /** Дождаться доставки событий шины и конца обработки сигналов беседы. */
  async settle(): Promise<void> {
    await this.bus.delivered();
    await this.conversations.settled();
  }

  /** Дождаться конца обработки сигналов беседы, не трогая шину. */
  settled(): Promise<void> {
    return this.conversations.settled();
  }

  /** «Отметить задачу» и выбор задачи `title` вариантом поля. */
  async select(title: string): Promise<void> {
    await this.press(TOGGLE);
    await this.press(title);
  }

  /** Текст последнего сообщения беседы; вопрос поля идёт без вариантов. */
  text(): string {
    const message = this.messenger.chat(this.who.peer).at(-1)?.message;
    return message === undefined ? '' : PlainText.of(message.text);
  }

  /** Текст живого места (сообщения с вариантами). */
  liveText(): string {
    const message = this.live()?.message;
    return message === undefined ? '' : PlainText.of(message.text);
  }

  /** Есть ли живое место. */
  hasLive(): boolean {
    return this.live() !== undefined;
  }

  private send(signal: ConversationSignal): Promise<void> {
    return this.conversations.receive(signal);
  }
}
