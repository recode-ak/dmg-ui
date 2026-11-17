import type { PageViewState } from './page-view-state.types';
import type { ViewSource } from './view-source.types';

/**
 * Представление области: показывает состояние из источника в цели показа и
 * возвращает отписку. Устройство цели пакет не знает — это параметр типа
 * (D-UI-70).
 */
export type PageRegionPresenter<Target> = {
  show(source: ViewSource<PageViewState>, target: Target): () => void;
};

/** Цель текстового представления: запись текста области целиком. */
export type PageTextTarget = {
  write(text: string): void;
};
