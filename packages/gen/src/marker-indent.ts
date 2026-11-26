import { existsSync, readFileSync } from 'node:fs';

/**
 * Отступ строки маркера `// gen:*` в файле на диске: элемент встаёт с тем же
 * отступом, и форма biome сохраняется. Нет файла или маркера — отступ формы шаблона.
 */
export class MarkerIndent {
  /** Отступ маркера в файле path; fallback — число пробелов формы шаблона */
  of(path: string, marker: string, fallback: number): string {
    const line = this.lines(path).find((row) => row.trim() === marker);
    return line === undefined
      ? ' '.repeat(fallback)
      : line.slice(0, line.length - line.trimStart().length);
  }

  private lines(path: string): string[] {
    return existsSync(path) ? readFileSync(path, 'utf8').split('\n') : [];
  }
}
