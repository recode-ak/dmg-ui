/** Имена переменных окружения примера (D-UI-68): единственный список для `ExampleEnv`, README и `.env.example`. */
export const EXAMPLE_ENV = {
  token: 'EXAMPLE_TG_TOKEN',
  users: 'EXAMPLE_TG_USERS',
  log: 'EXAMPLE_TG_LOG',
  trace: 'EXAMPLE_TG_TRACE',
  data: 'EXAMPLE_TG_DATA',
} as const;

/** Те же имена списком. */
export const EXAMPLE_VARIABLES: readonly string[] = Object.values(EXAMPLE_ENV);
