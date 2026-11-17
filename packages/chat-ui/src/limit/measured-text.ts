import type { FormattedText, TextFragment } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import { Graphemes } from './graphemes';
import type { LengthUnit } from './limit.types';
import { TextLength } from './text-length';

/**
 * Видимый текст на графемах всего текста (D-UI-36): границы графем, длины до
 * них в единице лимита и вырезка фрагментов между границами. Граница — номер:
 * 0 — начало текста, `count` — конец. Каждая графема меряется один раз.
 */
export class MeasuredText {
  /** Видимый текст (`PlainText`). */
  readonly plain: string;
  /** Смещение UTF-16 по номеру границы. */
  private readonly offsets: number[] = [0];
  /** Длина текста до границы в единице — по номеру границы. */
  private readonly sums: number[] = [0];
  /** Номер границы по смещению UTF-16. */
  private readonly boundaries = new Map<number, number>([[0, 0]]);

  constructor(
    private readonly text: FormattedText,
    unit: LengthUnit,
  ) {
    this.plain = PlainText.of(text);
    const length = new TextLength(unit);
    let offset = 0;
    let sum = 0;
    for (const grapheme of new Graphemes(this.plain).list()) {
      offset += grapheme.length;
      // Графема в своей единице — 1: без повторной сегментации на каждую.
      sum += unit === 'grapheme' ? 1 : length.ofString(grapheme);
      this.boundaries.set(offset, this.offsets.length);
      this.offsets.push(offset);
      this.sums.push(sum);
    }
  }

  /** Число графем — номер последней границы. */
  get count(): number {
    return this.offsets.length - 1;
  }

  /** Смещение UTF-16 границы. */
  offset(boundary: number): number {
    return this.offsets[boundary] ?? this.plain.length;
  }

  /** Номер границы на смещении UTF-16; внутри графемы — `undefined`. */
  boundary(offset: number): number | undefined {
    return this.boundaries.get(offset);
  }

  /** Длина между границами в единице. */
  between(from: number, to: number): number {
    return this.sum(to) - this.sum(from);
  }

  /** Самая дальняя граница, до которой от начальной не больше бюджета; нет такой — начальная. */
  reach(from: number, budget: number): number {
    const limit = this.sum(from) + budget;
    let low = from;
    let high = this.count;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (this.sum(middle) <= limit) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  /** Фрагменты между границами: стили и ссылка — исходные, пустых нет, целый фрагмент — тот же объект; оборванный теряет момент. */
  slice(from: number, to: number): FormattedText {
    const start = this.offset(from);
    const end = this.offset(to);
    const sliced: TextFragment[] = [];
    let at = 0;
    for (const fragment of this.text) {
      const next = at + fragment.text.length;
      const left = Math.max(start, at);
      const right = Math.min(end, next);
      if (left < right) {
        sliced.push(
          left === at && right === next
            ? fragment
            : MeasuredText.torn(fragment, left - at, right - at),
        );
      }
      if (next >= end) break;
      at = next;
    }
    return sliced;
  }

  /** Оборванный фрагмент теряет момент: остаётся запасной текст. */
  private static torn(
    fragment: TextFragment,
    from: number,
    to: number,
  ): TextFragment {
    const text = fragment.text.slice(from, to);
    return fragment.link === undefined
      ? { text, styles: fragment.styles }
      : { text, styles: fragment.styles, link: fragment.link };
  }

  private sum(boundary: number): number {
    return this.sums[boundary] ?? 0;
  }
}
