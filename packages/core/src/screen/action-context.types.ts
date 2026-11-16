/** Контекст кода экрана: язык и часовой пояс; вызывающего код не видит. */
export type ActionContext = {
  readonly locale: string;
  readonly timeZone: string;
};
