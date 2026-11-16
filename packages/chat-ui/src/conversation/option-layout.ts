import { NUMBERED_PAGE } from './conversation.const';
import type { Layout } from './conversation.types';

/**
 * Раскладка вариантов под лимит мессенджера (D-UI-47): всё кнопками; иначе
 * страницы кнопок с одной кнопкой «Ещё» по кругу; когда на странице не
 * остаётся двух вариантов, а выбор номером разрешён, — номера в тексте по
 * `NUMBERED_PAGE`. Служебные кнопки остаются на каждой странице.
 *
 * @see option-layout.test.ts
 */
export class OptionLayout {
  /** `max` — лимит вариантов мессенджера (`capabilities.options.max`). */
  constructor(private readonly max: number) {}

  /** `items` — варианты, `service` — служебные кнопки, `numbered` — разрешён ли выбор номером. */
  of(items: number, service: number, numbered: boolean): Layout {
    if (items + service <= this.max) return { kind: 'all' };
    // Одна кнопка уходит под «Ещё».
    const size = this.max - service - 1;
    if (size < 2 && numbered) {
      return {
        kind: 'numbers',
        size: NUMBERED_PAGE,
        count: Math.ceil(items / NUMBERED_PAGE),
      };
    }
    const fitted = Math.max(size, 1);
    return { kind: 'pages', size: fitted, count: Math.ceil(items / fitted) };
  }
}
