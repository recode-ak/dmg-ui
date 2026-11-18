import type { PageLogger } from 'dmg-ui/web-ui';

/** Запуск сервера примера: порт (0 — свободный), каталог данных, задержка, лог и порт ожидания. */
export type ExampleWebServerSpec = {
  readonly port: number;
  readonly dataDir: string;
  readonly delayMs: number;
  readonly logger: PageLogger;
  /** Владелец процесса: файл пропусков чужого владельца отвергается; нет — проверки нет. */
  readonly uid?: number;
  /** Порт ожидания «медленного сервера»; по умолчанию настоящее. */
  readonly wait?: (ms: number) => Promise<void>;
};

/** Запущенный сервер: порт, разрешённые источники и остановка. */
export type ExampleWebServerHandle = {
  readonly port: number;
  readonly origins: readonly string[];
  /** Закрывает сокеты и освобождает сессии, не дожидаясь задержанного вызова; повторно — без действия. */
  stop(): Promise<void>;
};

/** Статические ответы сервера: сборка клиента и стили, готовые к отдаче. */
export type ExampleAssets = {
  readonly code: string;
  readonly styles: string;
};
