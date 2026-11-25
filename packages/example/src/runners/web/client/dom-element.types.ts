/** Теги, которые создаёт пример. */
export type ElementTag =
  | 'div'
  | 'section'
  | 'header'
  | 'main'
  | 'h2'
  | 'h3'
  | 'p'
  | 'ul'
  | 'li'
  | 'span'
  | 'kbd'
  | 'button'
  | 'form'
  | 'label'
  | 'input'
  | 'select'
  | 'option'
  | 'dialog';

/**
 * Свойства элемента — белый список. Текст людей — только `text` и `value`;
 * адресов (`href`) и произвольных атрибутов нет.
 */
export type ElementProps = {
  readonly class?: string;
  readonly type?: 'button' | 'submit' | 'text' | 'checkbox' | 'number' | 'date';
  /** Идентификатор — из имён Def и области (`ControlIds`), не из текстов людей. */
  readonly id?: string;
  readonly name?: string;
  /** Всплывающая подсказка (`title`). */
  readonly title?: string;
  /** Границы и шаг числового поля. */
  readonly min?: number;
  readonly max?: number;
  readonly step?: number | 'any';
  /** Форма без проверки браузера: замечания даёт схема ядра. */
  readonly novalidate?: boolean;
  readonly value?: string;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly draggable?: boolean;
  readonly tabindex?: number;
  /** Атрибуты `aria-<ключ>`. */
  readonly aria?: Readonly<Record<string, string>>;
  /** Атрибуты `data-<ключ>`. */
  readonly data?: Readonly<Record<string, string>>;
  /** Текст элемента — `textContent`. */
  readonly text?: string;
  readonly click?: () => void;
};

/** Дети элемента: пустые места пропускаются. */
export type ElementChildren = readonly (Node | undefined)[];
