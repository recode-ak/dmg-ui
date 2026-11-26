import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const DMG = resolve(ROOT, 'node_modules/.bin/dmg-core');

/** Запуск `dmg-core` в корне репо. */
const run = (...args: string[]) =>
  Bun.spawnSync([DMG, ...args], { cwd: ROOT, stdout: 'pipe', stderr: 'pipe' });

/** Реестры пакета: серия → файл с записями. Новая серия — строкой в список. */
const REGISTRIES: Record<string, string> = {
  'D-UI': 'docs/decisions.md',
  UI: 'docs/reference/rules.md',
  PG: 'docs/reference/rules.md',
  CH: 'docs/reference/rules.md',
  TG: 'docs/reference/rules.md',
  NM: 'docs/reference/rules.md',
  'GR-UI': 'docs/concepts/frontend-layers.md',
  'DEBT-UI': 'debt.md',
  'DISC-UI': 'discussion.md',
};

/** Первый живой ID серии в её файле: заголовок записи `### ID` или строка таблицы `| ID`. */
const liveId = (series: string, path: string): string | undefined => {
  const record = new RegExp(`^(?:#{3}\\s+|\\|\\s*\`?)(${series}-\\d+)\\b`, 'm');
  return record.exec(readFileSync(join(ROOT, path), 'utf8'))?.[1];
};

/** Все `.md` репо, кроме `node_modules` и `.git`, — пути от корня. */
const markdownFiles = (dir = ROOT): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(full);
    return entry.name.endsWith('.md') ? [relative(ROOT, full)] : [];
  });

describe('дерево документов репо', () => {
  // Выпавшая строка «Серия» молча выключает проверку ссылок на ID (DOC-07):
  // по живой записи каждой серии `docs show` должен её находить.
  it('реестры объявляют свои серии: по ID записи docs show находит запись', () => {
    const lost: string[] = [];
    for (const [series, path] of Object.entries(REGISTRIES)) {
      const id = liveId(series, path);
      if (!id) {
        lost.push(`${series}: в ${path} нет ни одной записи`);
        continue;
      }
      const shown = run('docs', 'show', '--titles', id);
      if (shown.exitCode !== 0) {
        lost.push(`${id}: ${shown.stderr.toString().trim()}`);
      }
    }
    expect(lost).toEqual([]);
  });

  // Документ вне дерева от llms.txt остался бы без проверки ссылок, подписей и бюджета.
  it('каждый .md репо входит в дерево docs --check (вместе с llms.txt)', () => {
    // Предусловие: число документов печатается только без нарушений.
    const checked = run('docs', '--check');
    expect(checked.stderr.toString()).toBe('');
    const total = /документов — (\d+)/.exec(checked.stdout.toString())?.[1];
    const files = [...markdownFiles(), 'llms.txt'].sort();
    expect({ total: Number(total), files }).toEqual({
      total: files.length,
      files,
    });
  });
});
