import type { Place } from '../screen/action-context.types';

/**
 * Контекст вида: место и признаки вызывающего — заместитель и «только
 * чтение». Субъекта в виде нет (D-UI-98).
 */
export type ViewContext = Place & {
  readonly delegate: boolean;
  readonly readOnly: boolean;
};

/**
 * Контекст рендера от канала: контекст вида плюс субъект. В ядре субъект
 * непрозрачен: его получает только код экрана (`ActionContext`).
 */
export type RenderContext = ViewContext & {
  readonly subject?: unknown;
};
