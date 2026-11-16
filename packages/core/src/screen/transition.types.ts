import type { Address } from '../address/address';
import type { ExitValue } from '../manifest/screen-exit.types';

export type { ExitValue } from '../manifest/screen-exit.types';

/**
 * Переход, который возвращает код действия: адрес экрана (из `to` или свой
 * экран — неявно) или значение выхода своего экрана. Остальное отвергает
 * исполнитель.
 */
export type Transition = Address | ExitValue;
