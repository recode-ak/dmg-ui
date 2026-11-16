import type { ModuleSpecifier } from './module-specifiers.types';
import type { SourceFile } from './source-tree';

/** Поиск спецификаторов модулей в файле: `from '…'`, `import '…'`, `import('…')`, `require('…')`, в том числе шаблон без интерполяции. */
export class ModuleSpecifiers {
  protected static readonly PATTERN =
    /\b(?:from|import|require)\s*\(?\s*(['"`])([^'"`\n$]+)\1/g;

  constructor(protected readonly file: SourceFile) {}

  /** Разбор регулярным выражением, без парсера: достаточно для проверки направлений. */
  list(): ModuleSpecifier[] {
    return [...this.file.text.matchAll(ModuleSpecifiers.PATTERN)].map((m) => ({
      specifier: m[2] ?? '',
      line: this.file.lineAt(m.index),
    }));
  }
}
