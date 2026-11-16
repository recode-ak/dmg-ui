import type { Identified } from 'dmg-core';
import type { AnyUiAppDef } from 'dmg-ui';
import type {
  RecipientCallers,
  ServerContext,
  UiServer,
  UiSession,
} from 'dmg-ui/server';
import type {
  NotificationMessage,
  ServerMessage,
} from '../wire/page-messages.types';

/** Логгер серверной половины — тот же порт, что у сервера UI. */
export type PageLogger = ServerContext['logger'];

/** Место личности: язык и часовой пояс контекста рендера. */
export type PagePlace = {
  readonly locale: string;
  readonly timeZone: string;
};

/** Сборка `PageHost`: приложение UI, сервер, личность по токену, лог. */
export type PageHostSpec<U extends Identified> = {
  readonly app: AnyUiAppDef;
  readonly server: UiServer<U>;
  /**
   * Порт сборки: `uuid` личности по токену соединения; не узнал —
   * `undefined`. Токен доказывает личность (Т-8): клиент `uuid` не шлёт.
   */
  readonly tokens: (token: string) => string | undefined;
  /** Порт сборки: вызывающий личности по её `uuid`. */
  readonly identities: (uuid: string) => RecipientCallers<U>;
  readonly logger: PageLogger;
  /** Место личностей; по умолчанию — `ru-RU`, `Asia/Oral`. */
  readonly place?: PagePlace;
};

/** Одно соединение: сессия личности, отправка клиенту, лог. */
export type PageConnectionSpec<U extends Identified> = {
  readonly session: UiSession<U>;
  readonly push: (message: ServerMessage) => void;
  readonly logger: PageLogger;
  /** Источник записей лога — имя страничного канала. */
  readonly source: string;
};

/** Получатель уведомлений в доставке — открытое соединение. */
export type PageRecipient = {
  notify(message: NotificationMessage): void;
};
