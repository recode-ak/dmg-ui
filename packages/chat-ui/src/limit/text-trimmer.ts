import type { FormattedText } from '../message/message.types';
import { PlainText } from '../message/plain-text';
import { ELLIPSIS } from './limit.const';
import type { TextLimit } from './limit.types';
import { MeasuredText } from './measured-text';
import { TextLength } from './text-length';

/**
 * Обрезка текста до лимита (D-UI-36): целые графемы всего текста в бюджет
 * `max − длина(…)`, хвостовые пробелы последнего оставленного фрагмента
 * снимаются, `…` дописывается в него и наследует его стили и ссылку.
 * `max` не меньше длины `…` в единице — так обещает схема возможностей.
 */
export class TextTrimmer {
  private readonly length: TextLength;

  constructor(private readonly limit: TextLimit) {
    this.length = new TextLength(limit.unit);
  }

  /** Уложился — тот же объект; иначе целые графемы и `…` в конце. */
  trim(text: FormattedText): FormattedText {
    if (this.length.of(text) <= this.limit.max) return text;
    const measured = new MeasuredText(text, this.limit.unit);
    const budget = this.limit.max - this.length.ofString(ELLIPSIS);
    const kept = measured.slice(0, measured.reach(0, budget));
    const last = kept.at(-1);
    if (last === undefined) return [{ text: ELLIPSIS, styles: [] }];
    return [
      ...kept.slice(0, -1),
      { ...last, text: last.text.trimEnd() + ELLIPSIS },
    ];
  }

  /** Строка — как текст из одного фрагмента без стилей. */
  trimString(text: string): string {
    return PlainText.of(this.trim([{ text, styles: [] }]));
  }
}
