/** Факты нажатия клавиши на странице: то, что решает, достанется ли оно странице. */
export type KeyFacts = {
  readonly key: string;
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  /** Фокус в поле ввода, списке выбора или редактируемом элементе. */
  readonly editable: boolean;
  /** Идёт набор через метод ввода (IME). */
  readonly composing: boolean;
  readonly defaultPrevented: boolean;
};
