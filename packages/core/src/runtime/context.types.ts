/** Контекст кода экрана: язык и часовой пояс; вызывающего код не видит. */
export type ActionContext = {
  readonly locale: string;
  readonly timeZone: string;
};

/**
 * Контекст рендера от канала: контекст кода плюс признаки вызывающего —
 * заместитель и «только чтение».
 */
export type RenderContext = ActionContext & {
  readonly delegate: boolean;
  readonly readOnly: boolean;
};
