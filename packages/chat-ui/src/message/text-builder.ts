import {
  INLINE_STYLES,
  LINE_BREAK,
  MOMENT_SHOWS,
  TEXT_STYLES,
} from './message.const';
import type {
  FormattedText,
  MomentShow,
  TextFragment,
  TextStyle,
} from './message.types';

/** Вложенный текст: стиль внешнего вызова ложится на все фрагменты, что построил `inner`. */
export type NestedText = (inner: TextBuilder) => TextBuilder;

/**
 * Построитель форматированного текста (D-UI-35). Пустое пропускается, соседи
 * с теми же стилями и ссылкой склеиваются, стили — в порядке `TEXT_STYLES` без
 * повторов, цитата и блок кода стоят на целых строках. Строки не экранируются:
 * это делает мессенджер, когда переводит текст в свой формат.
 */
export class TextBuilder {
  private readonly fragments: TextFragment[] = [];
  /** Текст начался с блока: внешнему построителю, может быть, нужен перевод строки перед ним. */
  private leadsWithBlock = false;
  /** Последним стоит блок без перевода строки в конце: следующему содержимому он нужен. */
  private afterBlock = false;

  /** Одна строка без стилей. */
  static of(text: string): FormattedText {
    return new TextBuilder().text(text).build();
  }

  text(text: string): this {
    this.add({ text, styles: [] });
    return this;
  }

  bold(text: string | NestedText): this {
    return this.styled('bold', text);
  }

  italic(text: string | NestedText): this {
    return this.styled('italic', text);
  }

  strike(text: string | NestedText): this {
    return this.styled('strike', text);
  }

  /** Строчный код: внешние строчные стили на него не действуют, ссылки нет. */
  code(text: string): this {
    this.add({ text, styles: ['code'] });
    return this;
  }

  link(label: string, url: string): this {
    this.add({ text: label, styles: [], link: url });
    return this;
  }

  /**
   * Момент времени: `text` — запасной текст, `at` — секунды Unix
   * (целое не меньше 0, безопасное). Неверный `at` или `show` — бросок.
   */
  moment(text: string, at: number, show: MomentShow): this {
    if (!Number.isSafeInteger(at) || at < 0) {
      throw new Error(
        `TextBuilder.moment: at — целое не меньше 0, безопасное (получено ${at})`,
      );
    }
    if (!MOMENT_SHOWS.includes(show)) {
      throw new Error(`TextBuilder.moment: неизвестный вид показа ${show}`);
    }
    this.add({ text, styles: [], moment: { at, show } });
    return this;
  }

  /** Целые строки: перед блоком и после него при нужде ставится `\n`. */
  quote(text: string | NestedText): this {
    this.block(this.nested('quote', text));
    return this;
  }

  /** Целые строки, без других стилей; язык блока — расширение мессенджера. */
  codeBlock(text: string): this {
    this.block([{ text, styles: ['codeBlock'] }]);
    return this;
  }

  line(): this {
    return this.text(LINE_BREAK);
  }

  paragraph(): this {
    return this.text(LINE_BREAK + LINE_BREAK);
  }

  build(): FormattedText {
    return [...this.fragments];
  }

  private styled(style: TextStyle, text: string | NestedText): this {
    if (typeof text === 'string') {
      this.add({ text, styles: [style] });
      return this;
    }
    const inner = text(new TextBuilder());
    if (inner.fragments.length === 0) return this;
    if (inner.leadsWithBlock) this.startBlock();
    for (const fragment of inner.fragments) {
      this.add(this.overlay(fragment, style));
    }
    this.afterBlock = inner.afterBlock;
    return this;
  }

  /** Фрагменты под стилем: строка — один фрагмент, вложенный текст — все его фрагменты. */
  private nested(
    style: TextStyle,
    text: string | NestedText,
  ): readonly TextFragment[] {
    if (typeof text === 'string') return [{ text, styles: [style] }];
    return text(new TextBuilder()).fragments.map((fragment) =>
      this.overlay(fragment, style),
    );
  }

  private block(fragments: readonly TextFragment[]): void {
    const content = fragments.filter((fragment) => fragment.text !== '');
    const last = content.at(-1);
    if (last === undefined) return;
    this.startBlock();
    for (const fragment of content) this.add(fragment);
    this.afterBlock = !last.text.endsWith(LINE_BREAK);
  }

  /** Блок начинается с новой строки; в начале текста перевода нет. */
  private startBlock(): void {
    const last = this.fragments.at(-1);
    if (last === undefined) {
      this.leadsWithBlock = true;
    } else if (!last.text.endsWith(LINE_BREAK)) {
      this.add({ text: LINE_BREAK, styles: [] });
    }
  }

  private add(fragment: TextFragment): void {
    if (fragment.text === '') return;
    if (this.afterBlock) {
      this.afterBlock = false;
      if (!fragment.text.startsWith(LINE_BREAK)) {
        this.push({ text: LINE_BREAK, styles: [] });
      }
    }
    this.push(fragment);
  }

  /** Сосед с тем же форматом склеивается: фрагмент заменяется новым, прежний не меняется. */
  private push(fragment: TextFragment): void {
    const index = this.fragments.length - 1;
    const last = this.fragments[index];
    if (last !== undefined && this.sameFormat(last, fragment)) {
      this.fragments[index] = { ...last, text: last.text + fragment.text };
    } else {
      this.fragments.push(fragment);
    }
  }

  private sameFormat(a: TextFragment, b: TextFragment): boolean {
    return (
      a.moment === undefined &&
      b.moment === undefined &&
      a.link === b.link &&
      a.styles.length === b.styles.length &&
      a.styles.every((style, index) => style === b.styles[index])
    );
  }

  /** Стиль поверх фрагмента: блок кода не берёт ничего, строчный код — только цитату. */
  private overlay(fragment: TextFragment, style: TextStyle): TextFragment {
    const { styles } = fragment;
    if (styles.includes(style) || styles.includes('codeBlock')) return fragment;
    if (styles.includes('code') && INLINE_STYLES.includes(style)) {
      return fragment;
    }
    return {
      ...fragment,
      styles: TEXT_STYLES.filter((s) => s === style || styles.includes(s)),
    };
  }
}
