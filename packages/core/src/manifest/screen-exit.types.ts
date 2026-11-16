/**
 * Значение выхода экрана: имя выхода и данные по его схеме. Это одна из
 * ветвей перехода, который возвращает код действия.
 */
export type ExitValue = {
  readonly exit: string;
  readonly data?: unknown;
};
