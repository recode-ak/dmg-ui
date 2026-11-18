/** Что страница получает от среды: читает окно и адрес один `main.ts`. */
export type ExamplePageEnv = {
  /** Окно: история, события страницы. */
  readonly browser: Window;
  /** Куда строится страница. */
  readonly root: HTMLElement;
  /** Источник страницы: `схема://хост:порт`. */
  readonly origin: string;
  /** Новый сокет к серверу страницы. */
  readonly connect: () => WebSocket;
  /** Перезагрузить страницу. */
  readonly reload: () => void;
  /** Строка консоли — только фиксированный текст. */
  readonly log: (text: string) => void;
};
