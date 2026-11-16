/**
 * Графемы строки (D-UI-36); `Intl.Segmenter` — один на пакет. Строку дают
 * целиком, а не по фрагменту, поэтому графема на стыке фрагментов не делится.
 */
export class Graphemes {
  private static readonly segmenter = new Intl.Segmenter(undefined, {
    granularity: 'grapheme',
  });

  constructor(private readonly text: string) {}

  /** Графемы подряд: их сцепка — исходная строка. */
  list(): string[] {
    return Array.from(
      Graphemes.segmenter.segment(this.text),
      (segment) => segment.segment,
    );
  }

  count(): number {
    return this.list().length;
  }
}
