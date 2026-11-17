import { MemoryLogger } from 'dmg-core/testing';
import { type AnyScreenDef, ScreenPreview, UiIds } from 'dmg-ui';
import {
  type ChatViews,
  DialogRenderer,
  type Message,
  ScreenPresenter,
  type ViewMessage,
} from 'dmg-ui/chat-ui';
import { ExampleUiSetDef, exampleCodes } from 'dmg-ui/testing';
import {
  type EditMessageReplyMarkupParams,
  type SendMessageParams,
  TELEGRAM_CAPABILITIES,
  TelegramMessenger,
} from 'dmg-ui/tg-bot';
import { MemoryBotApi } from './../bot-api/memory-bot-api';
import { EXAMPLE_CHAT, EXAMPLE_CONTEXT } from './example-telegram.const';

/**
 * Показ экранов учебного примера в Telegram без живого диалога (D-UI-67):
 * вид примера из Def проходит сборщик показа `DialogRenderer` на возможностях
 * Telegram, последнее сообщение представления уходит через
 * `TelegramMessenger` на `MemoryBotApi`. Результат — запрос, который получил бы
 * Bot API: JSON для снимков.
 */
export class ExampleTelegramPreview {
  private readonly preview: ScreenPreview;
  private readonly ids: UiIds;

  constructor(private readonly views: ChatViews) {
    this.preview = new ScreenPreview({
      set: views.set,
      codes: exampleCodes(),
    });
    this.ids = new UiIds(ExampleUiSetDef);
  }

  /** Запрос `sendMessage` экрана по примеру. */
  async screen(def: AnyScreenDef, example: string): Promise<SendMessageParams> {
    const { api } = await this.shown(def, example);
    const sent = api.journal.find((call) => call.method === 'sendMessage');
    if (sent === undefined) {
      throw new Error(`ExampleTelegramPreview: ${def.name} не отправлен`);
    }
    return sent.params;
  }

  /** Запрос `editMessageReplyMarkup` ушедшего экрана: нажат вариант с подписью `label`. */
  async retired(
    def: AnyScreenDef,
    example: string,
    label: string,
  ): Promise<EditMessageReplyMarkupParams> {
    const { api, messenger, message } = await this.shown(def, example);
    const chosen = message.options.find((option) => option.label === label);
    if (chosen === undefined) {
      throw new Error(`ExampleTelegramPreview: нет варианта «${label}»`);
    }
    await messenger.retire(String(EXAMPLE_CHAT), '1', message, chosen.ref);
    const edited = api.journal.find(
      (call) => call.method === 'editMessageReplyMarkup',
    );
    if (edited === undefined) {
      throw new Error(`ExampleTelegramPreview: ${def.name} не закрыт`);
    }
    return edited.params;
  }

  private async shown(def: AnyScreenDef, example: string) {
    const message = await this.message(def, example);
    const api = new MemoryBotApi();
    const messenger = new TelegramMessenger({
      api,
      logger: new MemoryLogger(),
    });
    await messenger.show(String(EXAMPLE_CHAT), message);
    return { api, messenger, message };
  }

  /**
   * Вывод представления экрана как сообщение порта: представление
   * перехватывается на пути сборщика показа, варианты получают ссылки по порядку.
   */
  private async message(def: AnyScreenDef, example: string): Promise<Message> {
    const view = await this.preview.screen(def, example, EXAMPLE_CONTEXT);
    const base = this.views.screen(this.ids.screen(def));
    let caught: ViewMessage | undefined;
    const spy = ScreenPresenter.of(def, {
      render: (screenView, kit) => {
        const output = base.render(screenView, kit);
        caught = 'kind' in output ? output : output.at(-1);
        return output;
      },
    });
    new DialogRenderer(this.views.over([spy]), TELEGRAM_CAPABILITIES).screen(
      view,
    );
    if (caught === undefined) {
      throw new Error(`ExampleTelegramPreview: ${def.name} без вывода`);
    }
    return {
      kind: 'text',
      text: caught.text,
      options: caught.options.map((option, i) => ({
        ref: String(i + 1),
        label: option.label,
        ...('accent' in option && option.accent !== undefined
          ? { accent: option.accent }
          : {}),
      })),
    };
  }
}
