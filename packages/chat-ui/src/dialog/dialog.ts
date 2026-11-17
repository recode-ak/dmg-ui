import { type InstanceJson, UiIds } from 'dmg-ui';
import type { DeliveredNotification, ServerContext } from 'dmg-ui/server';
import { Conversation } from '../conversation/conversation';
import type {
  ConversationSignal,
  SignalHead,
} from '../conversation/conversation.types';
import { RefEpochs } from '../conversation/ref-epochs';
import { VIEW_TEXTS } from '../view/view.const';
import type { DialogOption, DialogReply, DialogSpec } from './dialog.types';
import { DIALOG_CHANNEL, DIALOG_HOME } from './dialog-channel.const';
import { ReplyMessenger } from './reply-messenger';

/** Логгер учебного фасада: беседе он обязателен, у диалога в спеке его нет. */
const SILENT_LOGGER: ServerContext['logger'] = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/**
 * Учебный диалог одной личности — фасад над беседой (D-UI-48): прежний облик
 * (`start`, `say`, `press`, `suspend`, `resume`, `notify`; реплики `replies`,
 * уведомления `inbox`), а очередь, таблица ссылок, сбор входа и политики
 * исходов — у `Conversation` с мессенджером реплик. Сигналы получают id от
 * счётчика фасада; собеседник и отправитель — uuid личности.
 */
export class Dialog {
  readonly replies: DialogReply[] = [];
  readonly inbox: DialogReply[] = [];
  private readonly spec: DialogSpec;
  private readonly person: string;
  private readonly conversation: Conversation;
  private readonly ids: UiIds;
  private signals = 0;

  constructor(spec: DialogSpec) {
    this.spec = spec;
    this.person = spec.person ?? DIALOG_CHANNEL;
    this.ids = new UiIds(spec.views.set);
    this.conversation = new Conversation({
      app: spec.app,
      runtime: spec.runtime,
      contexts: spec.identity,
      traces: spec.traces,
      views: spec.views,
      messenger: new ReplyMessenger(this.replies, this.inbox),
      logger: SILENT_LOGGER,
      peer: this.person,
      person: this.person,
      home: DIALOG_HOME,
      epochs: RefEpochs.random,
    });
  }

  /** Вход приложения UI по имени; неизвестный вход — ошибка канала, бросок. */
  async start(entry: string): Promise<void> {
    if (!Object.hasOwn(this.spec.app.entries, entry)) {
      throw new Error(
        `Dialog: у приложения ${this.spec.app.name} нет входа ${entry}`,
      );
    }
    await this.receive({ kind: 'enter', entry, ...this.head() });
  }

  /** Свободный текст: ожидаемому полю или основному действию вида. */
  async say(text: string): Promise<void> {
    await this.receive({ kind: 'text', text, ...this.head() });
  }

  /** Нажатие варианта по ссылке; ссылка не выдавалась — реплика, не бросок. */
  async press(ref: string): Promise<void> {
    const head = this.head();
    await this.receive({ kind: 'press', ref, press: head.id, ...head });
  }

  /** Снимок живого экземпляра для хранения; экрана нет — ошибка канала. */
  suspend(): InstanceJson {
    const instance = this.conversation.screen();
    if (instance === undefined) {
      throw new Error('Dialog: живого экрана нет — сначала start или resume');
    }
    return instance;
  }

  /** Восстановление из снимка (внешние данные); отказ — вход `start`. */
  resume(json: unknown): Promise<void> {
    return this.conversation.resume(json);
  }

  /** Уведомление во входящие; ссылки — в таблице беседы, подпись — экрана цели; живой экран не трогает. */
  async notify(notification: DeliveredNotification): Promise<void> {
    const text = this.spec.views
      .notification(notification.notification)
      .text(notification.data);
    const options: DialogOption[] = [];
    for (const address of notification.links) {
      const label =
        this.ids.findScreen(address.screen)?.label ?? VIEW_TEXTS.open;
      options.push({
        ref: await this.conversation.link(address, label),
        label,
      });
    }
    this.inbox.push({ text, options });
  }

  private async receive(signal: ConversationSignal): Promise<void> {
    await this.conversation.receive(signal);
  }

  /** Общая часть сигнала: id от счётчика, собеседник и отправитель — личность. */
  private head(): SignalHead {
    this.signals += 1;
    return {
      id: `s${this.signals}`,
      peer: this.person,
      sender: this.person,
    };
  }
}
