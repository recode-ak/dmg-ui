/** Место личности: язык и часовой пояс, в которых ей показывают экраны. */
export type Place = {
  readonly locale: string;
  readonly timeZone: string;
};

/**
 * Контекст кода экрана — место личности и субъект (D-UI-98): тот же объект,
 * что получает Policy (у заместителя — принципал). Вызывающего код не видит
 * (D-UI-11). `S` — тип субъекта проекта; нет субъекта — `undefined`.
 */
export type ActionContext<S = unknown> = Place & {
  readonly subject?: S;
};
