/** Вид сообщения (D-UI-35). Объявлены все пять; общая часть показывает только `text`. */
export type MessageKind = 'text' | 'image' | 'audio' | 'video' | 'document';

/**
 * Стиль фрагмента — пересечение мессенджеров. `code` сочетается только с `quote`;
 * `codeBlock` — ни с чем и без ссылки; `codeBlock` и `quote` занимают целые строки.
 */
export type TextStyle =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'codeBlock'
  | 'quote';

/** Фрагмент: строка как есть (без разметки и экранирования), стили, ссылка. */
export type TextFragment = {
  readonly text: string;
  /** Без повторов, в порядке `TEXT_STYLES`; пусто — без стилей. */
  readonly styles: readonly TextStyle[];
  /** Адрес ссылки; `text` — её подпись. */
  readonly link?: string;
};

/** Форматированный текст: фрагменты подряд; перевод строки — `\n` внутри `text`. */
export type FormattedText = readonly TextFragment[];

/** Вариант: подпись и короткая ссылка беседы. */
export type MessageOption = { readonly ref: string; readonly label: string };

export type TextMessage = {
  readonly kind: 'text';
  readonly text: FormattedText;
  readonly options: readonly MessageOption[];
};

/** Сообщение, которое уходит в порт мессенджера. */
export type Message = TextMessage;
