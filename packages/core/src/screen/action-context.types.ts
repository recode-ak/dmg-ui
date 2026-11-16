/** Место личности: язык и часовой пояс, в которых ей показывают экраны. */
export type Place = {
  readonly locale: string;
  readonly timeZone: string;
};

/** Контекст кода экрана — место личности; вызывающего код не видит. */
export type ActionContext = Place;
