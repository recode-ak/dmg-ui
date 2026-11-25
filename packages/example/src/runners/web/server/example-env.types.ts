/** Уровень журнала примера. */
export type ExampleLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Разобранное окружение примера. Каталог данных не задан — выбирает `main.ts`. */
export type ExampleEnvValue = {
  port: number;
  delayMs: number;
  logLevel: ExampleLogLevel;
  dataDir?: string;
};

/** Отказ разбора: имя переменной и текст без её значения. */
export type ExampleEnvError = {
  variable: string;
  text: string;
};
