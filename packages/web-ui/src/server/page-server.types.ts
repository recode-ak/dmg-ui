import type { Identified } from 'dmg-core';
import type { AnyUiAppDef } from 'dmg-ui';
import type {
  PersonPlaces,
  RecipientCallers,
  ServerContext,
  UiServer,
  UiSession,
} from 'dmg-ui/server';
import type {
  ClientMessage,
  NotificationMessage,
  RefusedMessage,
  ServerMessage,
} from '../wire/page-messages.types';
import type { PageServerPort, ServerLink } from '../wire/page-wire.types';

/** Логгер серверной половины — тот же порт, что у сервера UI. */
export type PageLogger = ServerContext['logger'];

/** Сборка `PageHost`: приложение UI, сервер, личность по токену, место, лог. */
export type PageHostSpec<U extends Identified> = {
  readonly app: AnyUiAppDef;
  readonly server: UiServer<U>;
  /**
   * Порт сборки: `uuid` личности по токену, который доказывает личность
   * (D-UI-33, D-UI-72). Не узнал — `undefined`; клиент `uuid` не шлёт.
   * Асинхронный: хранилище сессий входа — внешнее.
   */
  readonly tokens: (token: string) => Promise<string | undefined>;
  /** Порт сборки: вызывающий личности по её `uuid` (как у мессенджеров). */
  readonly callers: RecipientCallers<U>;
  /** Порт сборки: место личности — язык и часовой пояс (D-UI-41). */
  readonly places: PersonPlaces;
  readonly logger: PageLogger;
  /**
   * Перевод субъекта вызывающего (у заместителя — принципал) в JSON для
   * `hello.context.subject`; клиент восстанавливает его `reviveSubject`.
   * Отдавать только то, что нужно правилам клиента. Без перевода субъект в
   * `hello` не уходит.
   */
  readonly subjectToWire?: (subject: U) => unknown;
};

/**
 * Заголовки запроса соединения, какими их видит `PageGate`: структурно —
 * `Headers` (имя без учёта регистра); нет заголовка — `null`.
 */
export type PageHeaders = {
  get(name: string): string | null;
};

/** Сборка `PageGate`: разрешённые источники запроса и имя cookie пропуска. */
export type PageGateSpec = {
  /**
   * Источники (`схема://хост[:порт]`) — точным совпадением. Каждый — в
   * канонической форме: схема и хост в нижнем регистре, без пути и косой
   * черты, порт — только нестандартный. Пустой список, `'null'` или
   * неканонический элемент — бросок сборки.
   */
  readonly origins: readonly string[];
  /** Имя cookie, в которой браузер несёт пропуск соединения. */
  readonly cookie: string;
};

/** Отказ ворот: источника нет или он чужой — `origin`; нет годного пропуска — `token`. */
export type PageGateRefusal = 'origin' | 'token';

/** Одно соединение: сессия личности, отправка клиенту, лог. */
export type PageConnectionSpec<U extends Identified> = {
  readonly session: UiSession<U>;
  readonly push: (message: ServerMessage) => void;
  readonly logger: PageLogger;
  /** Источник записей лога — имя страничного канала. */
  readonly source: string;
};

/** Отправка одному соединению с пределом длины строки (`PageOutbox`). */
export type PageOutboxSpec = {
  /** Строка JSON — в сокет соединения как есть. */
  readonly send: (text: string) => void;
  readonly logger: PageLogger;
  /** Источник записей лога — имя страничного канала. */
  readonly source: string;
};

/** Пропуск соединения, извлечённый из запроса до открытия сокета. */
export type PageAdmission = {
  readonly token: string;
};

/**
 * Сокет сервера, каким его видит мост, — узкий структурный тип (D-UI-71).
 * Сокет сервера среды с `data: PageAdmission` проходит его без адаптера,
 * глобалов среды в пакете нет.
 */
export type PageServerSocket = {
  readonly data: PageAdmission;
  send(text: string): unknown;
  close(code?: number, reason?: string): void;
};

/** Сборка `PageSockets`: порт серверной половины и лог. */
export type PageSocketsSpec = {
  readonly host: PageServerPort;
  readonly logger: PageLogger;
};

/**
 * Состояние одного сокета в мосте: связь — после `connect`, `closed` —
 * отправка и приём прекращены, `opened` — завершение `connect`.
 */
export type SocketState = {
  link: ServerLink | undefined;
  closed: boolean;
  /** `warn` о двоичном кадре уже записан этим сокетом. */
  binaryWarned: boolean;
  opened: Promise<void>;
};

/** Получатель уведомлений в доставке — открытое соединение. */
export type PageRecipient = {
  notify(message: NotificationMessage): void;
};

/** Разбор строки клиента: сообщение по схеме или отказ ей. */
export type ParsedLine =
  | { readonly message: ClientMessage }
  | { readonly refused: RefusedMessage };
