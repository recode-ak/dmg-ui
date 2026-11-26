import { LineWidth } from './line-width';

/** Импорт одного имени: имя, источник и режим `type` */
export type ImportEntry = {
  readonly name: string;
  readonly from: string;
  readonly type?: boolean;
};

/**
 * Блок импортов по одному имени из источника в порядке biome: пакеты по
 * спецификатору, относительные — в конце.
 */
export class ImportLines {
  private readonly width = new LineWidth();

  /** Строки импортов, отсортированные по источнику */
  of(entries: readonly ImportEntry[]): string {
    const rank = (from: string) => (from.startsWith('.') ? 1 : 0);
    return [...entries]
      .sort(
        ({ from: a }, { from: b }) =>
          rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0),
      )
      .map(({ name, from, type }) =>
        this.width.importOf(name, from, type === true),
      )
      .join('\n');
  }
}
