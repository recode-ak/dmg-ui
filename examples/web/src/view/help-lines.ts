import type { HelpItem, HelpSheet } from 'dmg-ui';
import type { HelpModel, HelpSection } from './region-model.types';
import { HELP_TEXTS } from './view-texts.const';

/**
 * Модель справки области по листу `HelpSheet`: разделы «действия» и
 * «переходы», пустой раздел опущен. Подписи разделов и слово «недоступно» —
 * из `HELP_TEXTS`, остальное — слова листа как есть (подпись, подсказка,
 * причина); имён Def в строках нет. Чистая: ни DOM, ни среды.
 *
 * @see help-lines.test.ts
 */
export class HelpLines {
  private constructor(private readonly sheet: HelpSheet) {}

  /** Модель по листу; `open` — решение кадра области, не листа. */
  static of(sheet: HelpSheet, open: boolean): HelpModel {
    return new HelpLines(sheet).model(open);
  }

  private model(open: boolean): HelpModel {
    const { sheet } = this;
    return {
      open,
      title: sheet.title,
      ...(sheet.hint === undefined ? {} : { hint: sheet.hint }),
      sections: [
        this.section(HELP_TEXTS.items, sheet.items),
        this.section(HELP_TEXTS.leads, sheet.leads),
      ].filter((found) => found !== undefined),
    };
  }

  /** Раздел — заголовок и строки пунктов; пустой раздел — `undefined`. */
  private section(
    heading: string,
    items: readonly HelpItem[],
  ): HelpSection | undefined {
    if (items.length === 0) return undefined;
    return { heading, lines: items.map((item) => this.line(item)) };
  }

  /** «Подпись — подсказка (недоступно: причина)»; части без текста опущены. */
  private line(item: HelpItem): string {
    const hint = item.hint === undefined ? '' : ` — ${item.hint}`;
    const off =
      item.disabled === undefined
        ? ''
        : ` (${HELP_TEXTS.unavailable}: ${item.disabled})`;
    return `${item.label}${hint}${off}`;
  }
}
