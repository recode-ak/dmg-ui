/** Что собирать: вход (абсолютный путь) и виртуальные файлы поверх диска; по умолчанию — клиент примера. */
export type ClientBundleSpec = {
  readonly entry: string;
  readonly files?: Record<string, string>;
};

/** Результат сборки: вывод и то, что видно в метафайле. */
export type ClientBundleResult = {
  /** Текст единственного выхода. */
  readonly code: string;
  /** Пути входов сборки (от корня запуска, с `../` до корня репо). */
  readonly inputs: string[];
  /** Пути всех импортов входов, в том числе внешних (`node:*` под браузер заменяется пустым объектом, но здесь виден). */
  readonly imports: string[];
  /** Число выходов: клиент собирается одним файлом. */
  readonly outputs: number;
};
