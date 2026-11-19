/** Клавиши, которые `BrowserPage.press` умеет нажимать. */
export type PageKey = 'Tab' | 'Enter' | 'Space';

/** Элемент в дереве доступности: то, что читает скринридер. */
export type AccessibleNode = {
  readonly role: string;
  readonly name: string;
  /** Описание (`aria-describedby`); `''`, если его нет. */
  readonly description: string;
  /** Отключён (`disabled` или `aria-disabled`); `false`, если свойства нет. */
  readonly disabled: boolean;
  /** Доступен ли с клавиатуры (Tab); `false`, если свойства нет. */
  readonly focusable: boolean;
};

/** Свойство узла дерева доступности в ответе DevTools. */
export type AxProperty = {
  readonly name: string;
  readonly value: { readonly value?: unknown };
};

/** Узел дерева доступности в ответе `Accessibility.getPartialAXTree`. */
export type AxNode = {
  readonly role?: { readonly value?: string };
  readonly name?: { readonly value?: string };
  readonly description?: { readonly value?: string };
  readonly properties?: readonly AxProperty[];
};

/** Клавиша для `Input.dispatchKeyEvent`: имя, код, виртуальный код и вводимый текст. */
export type KeyDescription = {
  readonly key: string;
  readonly code: string;
  readonly windowsVirtualKeyCode: number;
  readonly text?: string;
};
