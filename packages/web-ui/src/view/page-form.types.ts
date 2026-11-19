import type { ItemTexts } from 'dmg-ui';

/** Значения формы по именам полей — строки, как у формы страницы. */
export type PageFormValues = Readonly<Record<string, string>>;

/** Поле формы: подпись, варианты (подписи), значение и замечания по полю. */
export type PageFormField = {
  readonly name: string;
  readonly label: string;
  readonly optional: boolean;
  /** Подписи вариантов в порядке кода экрана; значение формы — подпись. */
  readonly choices?: readonly string[];
  /** Введённое в отвергнутую форму, иначе начальное, иначе пустая строка. */
  readonly value: string;
  readonly issues: readonly string[];
};

/** Форма действия или локального действия. */
export type PageForm = {
  readonly kind: 'action' | 'local';
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly primary: boolean;
  readonly available: boolean;
  /** Текст отключения из вида; у доступного действия ключа нет (`offline` и ожидание итога причины не дают). */
  readonly reason?: string;
  /** Подтверждение — свойство действия. */
  readonly confirm?: ItemTexts;
  readonly fields: readonly PageFormField[];
  /** Замечания к этой форме без поля. */
  readonly issues: readonly string[];
};

/** Формы области и замечания, которые не привязаны к форме. */
export type PageFormSet = {
  readonly forms: readonly PageForm[];
  readonly general: readonly string[];
};
