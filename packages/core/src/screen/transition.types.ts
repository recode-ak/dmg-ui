import type { Address } from '../address/address';
import type { ExitValue } from '../manifest/screen-exit.types';

export type { ExitValue } from '../manifest/screen-exit.types';

/**
 * Переход, который возвращает код действия: адрес экрана (из `to` или свой
 * экран, Т-7) или значение выхода своего экрана. Остальное отвергает
 * исполнитель (Ф4).
 */
export type Transition = Address | ExitValue;
