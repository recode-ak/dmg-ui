/** Имена переменных окружения примера: единственный список для `ExampleEnv`, README и `.env.example`. */
export const EXAMPLE_ENV = {
  port: 'EXAMPLE_WEB_PORT',
  delay: 'EXAMPLE_WEB_DELAY_MS',
  data: 'EXAMPLE_WEB_DATA',
  log: 'EXAMPLE_WEB_LOG',
} as const;

/** Значения по умолчанию: порт примера и отсутствие задержки «медленного сервера». */
export const EXAMPLE_DEFAULTS = { port: 4310, delayMs: 0 } as const;

/** Пределы чисел: порт — 1–65535, задержка — 0–60000 мс. */
export const EXAMPLE_LIMITS = {
  portMax: 65535,
  delayMax: 60000,
} as const;
