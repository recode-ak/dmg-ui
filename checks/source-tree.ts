import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Исходный файл: путь от корня репо (через `/`) и текст; считает номера строк. */
export class SourceFile {
  protected constructor(
    readonly path: string,
    readonly text: string,
  ) {}

  /** Файл из памяти — для фикстур тестов. */
  static of(path: string, text: string): SourceFile {
    return new SourceFile(path, text);
  }

  /** Номер строки (с 1) для смещения в тексте. */
  lineAt(offset: number): number {
    let line = 1;
    for (let i = 0; i < offset; i++) {
      if (this.text.charCodeAt(i) === 10) line++;
    }
    return line;
  }

  /** Строки файла без переводов строки. */
  lines(): string[] {
    return this.text.split('\n');
  }
}

/** Чтение каталога `.ts` в набор `SourceFile` — единый способ чтения для всех сканеров. */
export class SourceTree {
  protected constructor(protected readonly root: string) {}

  /** Все `.ts` под `root/dir` (рекурсивно, кроме `node_modules`); пути — от `root`, по алфавиту. */
  static read(root: string, dir: string): SourceFile[] {
    return new SourceTree(root).files(dir);
  }

  protected files(dir: string): SourceFile[] {
    return this.collect(dir).map((path) =>
      SourceFile.of(path, readFileSync(join(this.root, path), 'utf8')),
    );
  }

  protected collect(dir: string): string[] {
    const found: string[] = [];
    const entries = readdirSync(join(this.root, dir), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') found.push(...this.collect(path));
      } else if (entry.name.endsWith('.ts')) {
        found.push(path);
      }
    }
    return found;
  }
}
