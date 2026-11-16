import type { FormattedText, TextFragment } from '../message/message.types';
import { SPLIT_SEPARATORS } from './limit.const';
import type { SplitCut, TextLimit } from './limit.types';
import { MeasuredText } from './measured-text';
import { TextLength } from './text-length';

/**
 * Разбиение текста на части не длиннее лимита (D-UI-36). Жадно: в окне до
 * `max` — последний разделитель высшего приоритета, если часть до него не
 * короче `max/2`, иначе следующий приоритет, в конце — граница графемы.
 * Разделитель на разрезе снимается; ссылка и строчный код, что укладываются
 * в `max`, внутри не режутся.
 */
export class TextSplitter {
  private readonly length: TextLength;

  constructor(private readonly limit: TextLimit) {
    this.length = new TextLength(limit.unit);
  }

  /** Части не длиннее лимита; уложился — `[text]` (тот же объект внутри). */
  split(text: FormattedText): readonly FormattedText[] {
    if (this.length.of(text) <= this.limit.max) return [text];
    const measured = new MeasuredText(text, this.limit.unit);
    const sealed = this.sealed(text);
    const parts: FormattedText[] = [];
    let from = 0;
    while (from < measured.count) {
      const cut = this.cut(measured, sealed, from);
      parts.push(measured.slice(from, cut.end));
      from = cut.next;
    }
    return parts;
  }

  /** Разрез части от начальной границы; графема длиннее `max` — отдельной частью. */
  private cut(
    measured: MeasuredText,
    sealed: ReadonlySet<number>,
    from: number,
  ): SplitCut {
    const reach = measured.reach(from, this.limit.max);
    if (reach === measured.count) return { end: reach, next: reach };
    if (reach === from) return { end: from + 1, next: from + 1 };
    return (
      this.atSeparator(measured, sealed, from, reach) ??
      this.atGrapheme(measured, sealed, from, reach)
    );
  }

  /** Порог `max/2` — к последнему допустимому разделителю приоритета; не прошёл — следующий приоритет. */
  private atSeparator(
    measured: MeasuredText,
    sealed: ReadonlySet<number>,
    from: number,
    reach: number,
  ): SplitCut | undefined {
    for (const separator of SPLIT_SEPARATORS) {
      const cut = this.lastSeparator(measured, sealed, separator, from, reach);
      if (
        cut !== undefined &&
        measured.between(from, cut.end) >= this.limit.max / 2
      ) {
        return cut;
      }
    }
    return undefined;
  }

  /** Разделитель начинается в окне (сам в окно влезать не обязан), стоит на границах графем и не внутри неделимого фрагмента. */
  private lastSeparator(
    measured: MeasuredText,
    sealed: ReadonlySet<number>,
    separator: string,
    from: number,
    reach: number,
  ): SplitCut | undefined {
    const start = measured.offset(from);
    let at = measured.plain.lastIndexOf(separator, measured.offset(reach));
    while (at > start) {
      const after = at + separator.length;
      const end = measured.boundary(at);
      const next = measured.boundary(after);
      if (
        end !== undefined &&
        next !== undefined &&
        !sealed.has(at) &&
        !sealed.has(after)
      ) {
        return { end, next };
      }
      at = measured.plain.lastIndexOf(separator, at - 1);
    }
    return undefined;
  }

  /** Последняя граница графемы в окне не внутри неделимого фрагмента; такой нет — край окна. */
  private atGrapheme(
    measured: MeasuredText,
    sealed: ReadonlySet<number>,
    from: number,
    reach: number,
  ): SplitCut {
    for (let end = reach; end > from; end -= 1) {
      if (!sealed.has(measured.offset(end))) return { end, next: end };
    }
    return { end: reach, next: reach };
  }

  /** Смещения UTF-16 строго внутри ссылок и строчного кода, что укладываются в `max`. */
  private sealed(text: FormattedText): ReadonlySet<number> {
    const inside = new Set<number>();
    let at = 0;
    for (const fragment of text) {
      const next = at + fragment.text.length;
      if (this.keptWhole(fragment)) {
        for (let offset = at + 1; offset < next; offset += 1)
          inside.add(offset);
      }
      at = next;
    }
    return inside;
  }

  private keptWhole(fragment: TextFragment): boolean {
    return (
      (fragment.link !== undefined || fragment.styles.includes('code')) &&
      this.length.ofString(fragment.text) <= this.limit.max
    );
  }
}
