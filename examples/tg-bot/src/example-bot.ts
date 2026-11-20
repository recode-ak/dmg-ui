import type { ExampleUser } from 'dmg-core/testing/example';
import { ExampleApp } from 'dmg-core/testing/example';
import { Conversations, MemoryConversationStore } from 'dmg-ui/chat-ui';
import { ExampleDialogUiAppDef } from 'dmg-ui/chat-ui/testing';
import {
  ApiAppDispatch,
  type PersonPlaces,
  UiNotifier,
  UiServer,
} from 'dmg-ui/server';
import { ExampleUiSetDef, exampleCodes } from 'dmg-ui/testing';
import {
  TelegramMenu,
  TelegramMessenger,
  TelegramUpdates,
} from 'dmg-ui/tg-bot';
import { exampleTelegramViews } from 'dmg-ui/tg-bot/testing';
import {
  ENTRY_POINTS,
  EXAMPLE_USER_A,
  EXAMPLE_USER_B,
} from './example-bot.const';
import type { ExampleBotSpec } from './example-bot.types';
import { ExamplePeople } from './example-people';

/** Место людей примера: часовой пояс момента из карточки задачи (`Asia/Oral`). */
const PLACES: PersonPlaces = {
  place: async () => ({ locale: 'ru-RU', timeZone: 'Asia/Oral' }),
};

/**
 * Узел примера (D-UI-68): учебное приложение, беседы в памяти, приём апдейтов,
 * меню и уведомления на порту Bot API. Не знает ни сети, ни библиотеки: порт
 * приходит параметром. Образец сборки — сторис Telegram пакета.
 */
export class ExampleBot {
  private readonly conversations: Conversations<ExampleUser>;
  private readonly telegram: TelegramUpdates;
  private readonly menu: TelegramMenu;
  private readonly notifier: UiNotifier<ExampleUser>;
  private readonly logger: ExampleBotSpec['logger'];
  private stopNotifier: (() => void) | undefined;

  constructor(spec: ExampleBotSpec) {
    const { api, logger, bus } = spec;
    this.logger = logger;
    const context = { bus, logger };
    const people = new ExamplePeople(spec.users, [
      EXAMPLE_USER_A,
      EXAMPLE_USER_B,
    ]);
    const example = new ExampleApp(
      {
        mode: 'test',
        dataDir: spec.dataDir,
        users: [EXAMPLE_USER_A, EXAMPLE_USER_B],
      },
      { bus, logger },
    );
    const dispatch = new ApiAppDispatch(example.api);
    const server = new UiServer({ set: ExampleUiSetDef, dispatch, context });
    const codes = exampleCodes();
    const observer = { record: () => {} };
    const messenger = new TelegramMessenger({ api, logger });
    this.conversations = new Conversations({
      app: ExampleDialogUiAppDef,
      codes,
      server,
      views: exampleTelegramViews,
      observer,
      messenger,
      store: new MemoryConversationStore(),
      logger,
      people: async (sender) => people.uuidOf(sender),
      peers: async (uuid) => people.idOf(uuid),
      callers: example.callers,
      places: PLACES,
    });
    this.telegram = new TelegramUpdates({
      conversations: this.conversations,
      messenger,
      logger,
      entryPoints: ENTRY_POINTS,
      bot: spec.bot,
    });
    this.menu = new TelegramMenu({
      api,
      logger,
      app: ExampleDialogUiAppDef,
      entryPoints: ENTRY_POINTS,
    });
    this.notifier = new UiNotifier({
      app: ExampleDialogUiAppDef,
      codes,
      dispatch,
      callers: example.callers,
      delivery: this.conversations,
      observer,
      context,
    });
  }

  /** Подписывает уведомления и публикует меню команд; повторный вызов ничего не делает. */
  async start(): Promise<void> {
    if (this.stopNotifier !== undefined) return;
    this.stopNotifier = this.notifier.start();
    await this.menu.publish();
  }

  /** Один апдейт Telegram; не бросает (ERR-01): сбой — запись без данных. */
  async receive(update: unknown): Promise<void> {
    try {
      await this.telegram.receive(update);
    } catch (error) {
      this.logger.error('ExampleBot', 'сбой приёма апдейта', {
        error: error instanceof Error ? error.name : typeof error,
      });
    }
  }

  /** Разрешается, когда беседы обработали всё принятое. */
  async settled(): Promise<void> {
    await this.conversations.settled();
  }

  /** Отписывает уведомления и закрывает беседы; безопасно без `start` и повторно. */
  async close(): Promise<void> {
    this.stopNotifier?.();
    this.stopNotifier = undefined;
    await this.conversations.close();
  }
}
