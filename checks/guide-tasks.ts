import { posix } from 'node:path';
import type { SourceFile } from './source-tree';
import { TextTree } from './text-tree';
import type { Violation } from './violation.types';

/** Блок кода гайда: номер первой строки содержимого и строки без ограждения. */
type Block = { line: number; lines: string[] };

/**
 * Проверка гайда «Задачи фронта»: каждое утверждение опирается на живой тест или код.
 * Строка `Проверено: [файл](путь) — «фрагмент»` — файл есть, фрагмент найден подстрокой
 * по всему тексту файла (в том числе в комментариях; «сценарий 1» найдётся и в «сценарий 10»);
 * у сценария (`### N.`) такая строка обязательна, у строки таблицы со столбцами «Состояние»
 * и «Проверено» — при состоянии «есть». Блок кода начинается `// из: путь`, его строки —
 * подпоследовательность строк файла образца.
 */
export class GuideTaskChecker {
  protected static readonly PROOF = /^\s*(?:[-*]\s+)?Проверено:/;
  protected static readonly LINK = /\[[^\]]*\]\(([^)\s]+)\)/g;
  protected static readonly QUOTE = /«([^»]+)»/g;
  protected static readonly FROM = /^\/\/ из:\s*(\S+)\s*$/;
  protected static readonly SCENARIO = /^###\s+\d+\./;
  protected static readonly HEADING = /^#{1,3}\s/;

  constructor(protected readonly root: string) {}

  check(guide: SourceFile): Violation[] {
    const found: Violation[] = [];
    const add = (line: number, text: string) =>
      found.push(this.at(guide, line, text));
    const blocks: Block[] = [];
    let proofs = 0;
    let scenario: { line: number; proved: boolean } | undefined;
    let columns: { proof: number; state: number } | undefined;
    let fenced: Block | undefined;
    let tableStart = true;
    const closeScenario = () => {
      if (scenario && !scenario.proved) {
        add(scenario.line, 'сценарий без строки «Проверено:»');
      }
    };

    for (const [index, text] of guide.lines().entries()) {
      const line = index + 1;
      if (text.trimStart().startsWith('```')) {
        if (fenced) blocks.push(fenced);
        fenced = fenced ? undefined : { line: line + 1, lines: [] };
        continue;
      }
      if (fenced) {
        fenced.lines.push(text);
        continue;
      }
      if (GuideTaskChecker.HEADING.test(text)) {
        closeScenario();
        scenario = GuideTaskChecker.SCENARIO.test(text)
          ? { line, proved: false }
          : undefined;
      }
      if (GuideTaskChecker.PROOF.test(text)) {
        proofs++;
        if (scenario) scenario.proved = true;
        found.push(...this.proof(guide, text, line));
      }
      const cells = this.cells(text);
      if (!cells) {
        columns = undefined;
        tableStart = true;
        continue;
      }
      if (tableStart) {
        const proof = cells.indexOf('Проверено');
        const state = cells.indexOf('Состояние');
        columns = proof < 0 ? undefined : { proof, state };
        tableStart = false;
      } else if (columns && !/^[\s:-]*$/.test(cells.join(''))) {
        const cell = cells[columns.proof] ?? '';
        if (GuideTaskChecker.PROOF.test(cell)) {
          proofs++;
          found.push(...this.proof(guide, cell, line));
        } else if ((cells[columns.state] ?? '').startsWith('есть')) {
          add(line, 'строка таблицы без «Проверено:» при состоянии «есть»');
        }
      }
    }
    closeScenario();
    if (fenced) add(fenced.line - 1, 'блок кода не закрыт');
    if (proofs === 0) add(1, 'в гайде нет ни одной строки «Проверено:»');
    for (const block of blocks) found.push(...this.block(guide, block));
    return found.sort((a, b) => a.line - b.line);
  }

  /** Ячейки строки таблицы или `undefined`, если строка — не таблица. */
  protected cells(text: string): string[] | undefined {
    if (!text.trimStart().startsWith('|')) return undefined;
    return text
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((cell) => cell.trim());
  }

  /** Пары «ссылка + фрагмент» строки `Проверено:`: файл есть, фрагмент — подстрока файла. */
  protected proof(guide: SourceFile, text: string, line: number): Violation[] {
    const links = [...text.matchAll(GuideTaskChecker.LINK)];
    if (links.length === 0) {
      return [this.at(guide, line, '«Проверено:» без ссылки на тест')];
    }
    return links.flatMap((link, i) => {
      const href = link[1] ?? '';
      const from = (link.index ?? 0) + link[0].length;
      const rest = text.slice(from, links[i + 1]?.index ?? text.length);
      const fragments = [...rest.matchAll(GuideTaskChecker.QUOTE)].map(
        (quote) => quote[1] ?? '',
      );
      const path = posix.normalize(posix.join(posix.dirname(guide.path), href));
      if (this.outside(path)) {
        return [this.at(guide, line, `${href}: путь вне репо`)];
      }
      const file = TextTree.file(this.root, path);
      if (!file) return [this.at(guide, line, `${href}: файл не найден`)];
      if (fragments.length === 0) {
        return [this.at(guide, line, `${href}: нет фрагмента в кавычках`)];
      }
      return fragments.flatMap((fragment) => {
        if (fragment.trim() === '') {
          return [this.at(guide, line, `${href}: пустой фрагмент`)];
        }
        return file.text.includes(fragment)
          ? []
          : [this.at(guide, line, `${href}: фрагмент «${fragment}» не найден`)];
      });
    });
  }

  /** Блок кода: первая строка `// из: путь`, остальные — по порядку из файла образца. */
  protected block(guide: SourceFile, block: Block): Violation[] {
    const rows = block.lines
      .map((text, i) => ({ text: text.trim(), line: block.line + i }))
      .filter((row) => row.text !== '');
    const from = GuideTaskChecker.FROM.exec(rows[0]?.text ?? '');
    const path = from?.[1];
    if (!path) {
      return [
        this.at(guide, block.line, 'блок кода без первой строки «// из: путь»'),
      ];
    }
    if (this.outside(posix.normalize(path))) {
      return [this.at(guide, block.line, `${path}: путь вне репо`)];
    }
    const sample = TextTree.file(this.root, path);
    if (!sample) return [this.at(guide, block.line, `${path}: файл не найден`)];
    const code = rows.slice(1);
    if (code.length === 0) {
      return [this.at(guide, block.line, `${path}: в блоке нет строк образца`)];
    }
    const source = sample.lines().map((text) => text.trim());
    let cursor = 0;
    for (const row of code) {
      const at = source.indexOf(row.text, cursor);
      if (at < 0) {
        const text = `${path}: строка не найдена по порядку: ${row.text}`;
        return [this.at(guide, row.line, text)];
      }
      cursor = at + 1;
    }
    return [];
  }

  /** Путь за пределами репо: выше корня или абсолютный. */
  protected outside(path: string): boolean {
    return path.startsWith('../') || path.startsWith('/');
  }

  protected at(guide: SourceFile, line: number, text: string): Violation {
    return { file: guide.path, line, text };
  }
}
