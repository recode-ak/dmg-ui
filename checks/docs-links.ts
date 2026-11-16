import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/** Проверка относительных ссылок `](путь)` и `](путь#якорь)` в документах: файл существует, якорь есть среди заголовков. */
export class DocsLinkChecker {
  protected static readonly LINK = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

  constructor(protected readonly root: string) {}

  check(docs: SourceFile[]): Violation[] {
    const found: Violation[] = [];
    for (const doc of docs) {
      let fenced = false;
      doc.lines().forEach((text, index) => {
        if (text.trimStart().startsWith('```')) fenced = !fenced;
        if (fenced) return;
        for (const match of text.matchAll(DocsLinkChecker.LINK)) {
          const problem = this.problem(doc, match[1] ?? '');
          if (problem) {
            found.push({ file: doc.path, line: index + 1, text: problem });
          }
        }
      });
    }
    return found;
  }

  protected problem(doc: SourceFile, link: string): string | undefined {
    if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return undefined;
    const [target = '', anchor] = link.split('#');
    const path = target === '' ? doc.path : this.resolve(doc.path, target);
    if (path.split('/').includes('node_modules')) return undefined;
    if (path.startsWith('../')) return `${link}: путь вне репо`;
    const full = join(this.root, path);
    if (!existsSync(full)) return `${link}: файл не найден`;
    if (anchor === undefined || anchor === '') return undefined;
    if (!statSync(full).isFile() || !path.endsWith('.md')) {
      return `${link}: якорь не в markdown-файле`;
    }
    return this.slugs(readFileSync(full, 'utf8')).has(anchor)
      ? undefined
      : `${link}: якорь не найден`;
  }

  protected resolve(from: string, target: string): string {
    const path = target.split('?')[0] ?? target;
    return posix.normalize(posix.join(posix.dirname(from), path));
  }

  /** Якоря заголовков по правилам GitHub: нижний регистр, без знаков, пробелы в `-`, повтор — `-1`, `-2`. */
  protected slugs(text: string): Set<string> {
    const slugs = new Set<string>();
    const seen = new Map<string, number>();
    let fenced = false;
    for (const line of text.split('\n')) {
      if (line.trimStart().startsWith('```')) fenced = !fenced;
      const heading = fenced ? null : /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (!heading) continue;
      const slug = (heading[1] ?? '')
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\s-]/gu, '')
        .replace(/\s/g, '-');
      const count = seen.get(slug) ?? 0;
      seen.set(slug, count + 1);
      slugs.add(count === 0 ? slug : `${slug}-${count}`);
    }
    return slugs;
  }
}
