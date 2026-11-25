import { FIELD_HOTKEY } from '../../../frontend/web-kit/view-texts.const';
import type { KeyFacts } from './hotkey-press.types';

/**
 * Решение по нажатию клавиши на странице: «/» вне поля ввода — клавиша поля
 * основной формы; `undefined` — нажатие остаётся браузеру и полю. Срабатывает
 * знак «/» любой раскладки и физическая клавиша `Slash` без Shift (в русской
 * раскладке на ней «.»). Объект, а не класс: преобразование без состояния.
 */
export const HotkeyPress = {
  key(facts: KeyFacts): string | undefined {
    if (facts.defaultPrevented || facts.composing || facts.editable) {
      return undefined;
    }
    if (facts.ctrlKey || facts.metaKey || facts.altKey) return undefined;
    const slash =
      facts.key === FIELD_HOTKEY || (facts.code === 'Slash' && !facts.shiftKey);
    return slash ? FIELD_HOTKEY : undefined;
  },
} as const;
