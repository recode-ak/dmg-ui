import type { RefTarget } from './dialog.types';

/**
 * Короткие ссылки вариантов (`r1`, `r2`, …) → цель. Ссылки не стираются,
 * как прошлые кнопки мессенджера: нажатие старой ссылки ядро встречает
 * исходом `stale` или `unavailable: closed`.
 *
 * Допущение учебного канала: таблица растёт без предела и держит закрытые
 * экземпляры в целях ссылок; боевому каналу нужен предел или срок жизни.
 */
export class RefTable {
  private readonly targets = new Map<string, RefTarget>();
  private count = 0;

  /** Новая ссылка на цель. */
  add(target: RefTarget): string {
    this.count += 1;
    const ref = `r${this.count}`;
    this.targets.set(ref, target);
    return ref;
  }

  /** Цель ссылки; ссылка не выдавалась (внешний ввод) — `undefined`. */
  target(ref: string): RefTarget | undefined {
    return this.targets.get(ref);
  }
}
