import type { HelpItem, HelpSheet } from 'dmg-ui';
import { HELP_TEXTS } from '../conversation/conversation.const';

/**
 * Текст справки беседы по листу ядра (`ScreenHelp`, D-UI-107): обычный текст
 * без стилей — один вид на беседу и любой мессенджер. Заголовок, подсказка,
 * разделы «что можно сделать» (`items`) и «куда можно пойти» (`leads`);
 * пустое опускается. Слов сверх листа и текстов `HELP_TEXTS` не добавляет.
 *
 * @see help-text.test.ts
 */
export class HelpText {
  private constructor(private readonly sheet: HelpSheet) {}

  /** Справка по экрану. */
  static of(sheet: HelpSheet): string {
    return new HelpText(sheet).text();
  }

  /** Справка без живого экрана; пустой лист — «справки пока нет». */
  static general(sheet: HelpSheet): string {
    const empty = sheet.items.length === 0 && sheet.leads.length === 0;
    return empty ? HELP_TEXTS.nothing : HelpText.of(sheet);
  }

  private text(): string {
    const { sheet } = this;
    const head = [`${HELP_TEXTS.title}: ${sheet.title}`];
    if (sheet.hint !== undefined) head.push(sheet.hint);
    return [
      head.join('\n'),
      ...this.section(HELP_TEXTS.items, sheet.items),
      ...this.section(HELP_TEXTS.leads, sheet.leads),
    ].join('\n\n');
  }

  /** Раздел — заголовок и строки пунктов; пустой раздел опущен. */
  private section(heading: string, items: readonly HelpItem[]): string[] {
    if (items.length === 0) return [];
    return [[heading, ...items.map((item) => this.line(item))].join('\n')];
  }

  private line(item: HelpItem): string {
    const hint = item.hint === undefined ? '' : ` — ${item.hint}`;
    const off =
      item.disabled === undefined
        ? ''
        : ` (${HELP_TEXTS.unavailable}: ${item.disabled})`;
    return `• ${item.label}${hint}${off}`;
  }
}
