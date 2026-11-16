import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SourceFile } from './source-tree';

/** Чтение текстовых файлов любых расширений (документы, снимки) в `SourceFile`; отсутствующее — не ошибка. */
export class TextTree {
  protected constructor(protected readonly root: string) {}

  /** Файлы с нужными расширениями под `root/dir` (рекурсивно, кроме `node_modules`); нет каталога — пусто. */
  static read(
    root: string,
    dir: string,
    extensions: readonly string[],
  ): SourceFile[] {
    return new TextTree(root).files(dir, extensions);
  }

  /** Один файл от корня или `undefined`, если его нет. */
  static file(root: string, path: string): SourceFile | undefined {
    return new TextTree(root).one(path);
  }

  protected files(dir: string, extensions: readonly string[]): SourceFile[] {
    return this.collect(dir, extensions).flatMap((path) => {
      const file = this.one(path);
      return file ? [file] : [];
    });
  }

  protected one(path: string): SourceFile | undefined {
    const full = join(this.root, path);
    return existsSync(full)
      ? SourceFile.of(path, readFileSync(full, 'utf8'))
      : undefined;
  }

  protected collect(dir: string, extensions: readonly string[]): string[] {
    if (!existsSync(join(this.root, dir))) return [];
    const found: string[] = [];
    const entries = readdirSync(join(this.root, dir), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') {
          found.push(...this.collect(path, extensions));
        }
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        found.push(path);
      }
    }
    return found;
  }
}
