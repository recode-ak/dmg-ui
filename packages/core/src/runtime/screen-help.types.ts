/**
 * Пункт справки: имя и подпись — из Def, подсказка — из вида. `disabled` —
 * причина отключения из вида; у доступного пункта ключа нет.
 */
export type HelpItem = {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: string;
};

/**
 * Содержание справки (D-UI-107): данные, не текст — текст строит канал.
 * `items` — действия и локальные действия вида, `leads` — доступные двери в
 * сторис приложения; у общей справки `leads` — корни приложения.
 */
export type HelpSheet = {
  readonly title: string;
  readonly hint?: string;
  readonly items: readonly HelpItem[];
  readonly leads: readonly HelpItem[];
};
