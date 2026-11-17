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

/**
 * Акцент варианта (D-UI-66) — важность, не цвет: основное, положительное,
 * опасное. Как его показать, решает мессенджер; без поддержки — подпись как есть.
 */
export type Accent = 'primary' | 'positive' | 'danger';

/** Вид показа момента: дата, время, дата со временем, «сколько осталось/прошло». */
export type MomentShow = 'date' | 'time' | 'dateTime' | 'relative';

/** Момент времени: секунды Unix и вид показа; человек видит его в своём часовом поясе. */
export type Moment = {
  /** Целое не меньше 0, безопасное. */
  readonly at: number;
  readonly show: MomentShow;
};

/** Фрагмент: строка как есть (без разметки и экранирования), стили, ссылка. */
export type TextFragment = {
  readonly text: string;
  /** Без повторов, в порядке `TEXT_STYLES`; пусто — без стилей. */
  readonly styles: readonly TextStyle[];
  /** Адрес ссылки; `text` — её подпись. */
  readonly link?: string;
  /** Момент времени; `text` — запасной текст: его видят мессенджеры без момента и `PlainText`. */
  readonly moment?: Moment;
};

/** Форматированный текст: фрагменты подряд; перевод строки — `\n` внутри `text`. */
export type FormattedText = readonly TextFragment[];

/** Вариант: подпись, короткая ссылка беседы и необязательный акцент. */
export type MessageOption = {
  readonly ref: string;
  readonly label: string;
  readonly accent?: Accent;
};

export type TextMessage = {
  readonly kind: 'text';
  readonly text: FormattedText;
  readonly options: readonly MessageOption[];
};

/** Сообщение, которое уходит в порт мессенджера. */
export type Message = TextMessage;
