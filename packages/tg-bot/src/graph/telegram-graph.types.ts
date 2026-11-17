/** Точка входа приложения Telegram: `id` узла графа и её свойства. */
export type TelegramPoint = {
  readonly id: string;
  readonly entry: string;
  readonly via: string;
  readonly key: string;
};

/** Приложение Telegram в графе: `id`, входы (имя → название) и точки входа в порядке таблицы. */
export type TelegramApp = {
  readonly id: string;
  readonly entries: ReadonlyMap<string, string>;
  readonly points: readonly TelegramPoint[];
};
