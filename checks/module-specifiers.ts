import type { SourceFile } from './source-tree';

/** Спецификатор модуля, найденный в файле, и строка его появления. */
export type ModuleSpecifier = {
  specifier: string;
  line: number;
};

/** Поиск спецификаторов модулей в файле: `from '…'`, `import '…'`, `import('…')`, `require('…')`. */
export class ModuleSpecifiers {
  protected static readonly PATTERN =
    /\b(?:from|import|require)\s*\(?\s*['"]([^'"\n]+)['"]/g;

  constructor(protected readonly file: SourceFile) {}

  /** Разбор регулярным выражением, без парсера: достаточно для проверки направлений. */
  list(): ModuleSpecifier[] {
    return [...this.file.text.matchAll(ModuleSpecifiers.PATTERN)].map((m) => ({
      specifier: m[1] ?? '',
      line: this.file.lineAt(m.index),
    }));
  }
}
