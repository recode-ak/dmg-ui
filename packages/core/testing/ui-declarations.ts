import type { UiDeclaration, UiExport } from './ui-declarations.types';
import { UI_FILE_KINDS } from './ui-file-names.const';

/**
 * Объявления видов UI и экспорты в тексте одного файла (`NM-01`). Регулярное выражение
 * без парсера по тексту без комментариев: строки остаются, номера строк не сдвигаются.
 * Слепые пятна (псевдоним базы, `export default class`, перенос перед `.define`,
 * объявление внутри строки, `export { X }`) — в «Ограничениях правил» `rules.md`.
 */
export class UiDeclarations {
  /** Объявления видов с базой; аннотация типа у `const` допустима (`X: T = ScreenDef.define(`). */
  private static readonly DECLARED = UI_FILE_KINDS.flatMap((kind) => {
    const declaration = kind.declaration;
    if (!declaration) return [];
    const pattern =
      declaration.form === 'define'
        ? `\\bexport\\s+const\\s+(\\w+)\\s*(?::(?:[^=;]|=>)+?)?=(?!>)\\s*${declaration.base}\\.define\\b`
        : `\\bexport\\s+(?:abstract\\s+)?class\\s+(\\w+)\\s*(?:<[^{]*?>)?\\s*extends\\s+${declaration.base}\\b`;
    return [{ kind, pattern: new RegExp(pattern, 'g') }];
  });

  /** Экспорты по имени — для видов канала без базы: у них вид только по суффиксу. */
  private static readonly EXPORTED =
    /\bexport\s+(?:abstract\s+)?(?:const|let|class|function)\s+(\w+)/g;

  /** `from '<./…|../…>'` импорта или реэкспорта — по нему выводится место экрана. */
  private static readonly RELATIVE_FROM = /\bfrom\s+(['"])(\.\.?\/[^'"]*)\1/g;

  private readonly text: string;

  constructor(source: string) {
    this.text = this.withoutComments(source);
  }

  /** Объявления видов с базой — в порядке строк. */
  declared(): UiDeclaration[] {
    return UiDeclarations.DECLARED.flatMap(({ kind, pattern }) =>
      [...this.text.matchAll(pattern)].map((match) => ({
        kind,
        name: match[1] ?? '',
        line: this.lineAt(match.index),
      })),
    ).sort((a, b) => a.line - b.line);
  }

  /** Экспорты `const`, `let`, `class`, `function` — в порядке текста. */
  exported(): UiExport[] {
    return [...this.text.matchAll(UiDeclarations.EXPORTED)].map((match) => ({
      name: match[1] ?? '',
      line: this.lineAt(match.index),
    }));
  }

  /** Относительные спецификаторы `from './…'` и `from '../…'` — в порядке текста; псевдонимы путей и пакеты — нет. */
  imports(): string[] {
    return [...this.text.matchAll(UiDeclarations.RELATIVE_FROM)].map(
      (match) => match[2] ?? '',
    );
  }

  private lineAt(offset: number): number {
    let line = 1;
    for (let i = 0; i < offset; i++) {
      if (this.text.charCodeAt(i) === 10) line++;
    }
    return line;
  }

  /**
   * Знаки комментариев — пробелы, переводы строк на месте. Строки и шаблоны пропускаются
   * целиком: `'**\/*.ts'` комментарий не открывает.
   */
  private withoutComments(source: string): string {
    let out = '';
    let i = 0;
    while (i < source.length) {
      const ch = source[i] ?? '';
      const next = source[i + 1];
      if (ch === '/' && (next === '/' || next === '*')) {
        const end =
          next === '/'
            ? this.indexOrEnd(source, '\n', i)
            : this.indexOrEnd(source, '*/', i + 2) + 2;
        out += source.slice(i, end).replace(/[^\n]/g, ' ');
        i = end;
      } else if (ch === "'" || ch === '"' || ch === '`') {
        let j = i + 1;
        while (j < source.length && source[j] !== ch) {
          j += source[j] === '\\' ? 2 : 1;
        }
        out += source.slice(i, j + 1);
        i = j + 1;
      } else {
        out += ch;
        i++;
      }
    }
    return out;
  }

  private indexOrEnd(source: string, needle: string, from: number): number {
    const at = source.indexOf(needle, from);
    return at < 0 ? source.length : at;
  }
}
