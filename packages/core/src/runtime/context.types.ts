import type { ActionContext } from '../screen/action-context.types';

/**
 * Контекст рендера от канала: контекст кода плюс признаки вызывающего —
 * заместитель и «только чтение».
 */
export type RenderContext = ActionContext & {
  readonly delegate: boolean;
  readonly readOnly: boolean;
};
