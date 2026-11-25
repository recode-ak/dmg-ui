/** Уровень журнала примера. */
export type ExampleLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Разобранное окружение примера (D-UI-68). */
export type ExampleEnvValue = {
  token: string;
  /** Допущенные id Telegram: один или два, первый — A, второй — B. */
  users: number[];
  logLevel: ExampleLogLevel;
  tracePath?: string;
  dataDir?: string;
};

/** Отказ разбора: имя переменной и текст без её значения. */
export type ExampleEnvError = {
  variable: string;
  text: string;
};
