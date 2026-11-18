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
  readonly type?: 'button' | 'submit' | 'text' | 'checkbox';
  readonly name?: string;
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
