import type { PageLogger } from 'dmg-ui/web-ui';

/** Сборка примера без сети: каталог данных, порт личности, лог и «медленный сервер». */
export type ExampleWebSpec = {
  /** Каталог данных учебного приложения. */
  readonly dataDir: string;
  /** `uuid` учебного пользователя по пропуску; не узнал — `undefined`. */
  readonly tokens: (token: string) => Promise<string | undefined>;
  readonly logger: PageLogger;
  /** Задержка исполнения команд, мс; `0` — без «медленного сервера». */
  readonly delayMs: number;
  /** Порт ожидания «медленного сервера»; по умолчанию настоящее. */
  readonly wait?: (ms: number) => Promise<void>;
};
