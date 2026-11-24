import type { SourceFile } from './source-tree';
import type { Violation } from './violation.types';

/**
 * Префиксы правил репо: `UI` — ядро, `PG` — страничный канал `web-ui`, `CH` —
 * общая часть мессенджеров, `TG` — Telegram, `NM` — имена файлов UI (проверка
 * `UiFileNames` в тестах, не правило графа). Общий шаблон `[A-Z]+-NN` нельзя: заголовки
 * `rules.md` упоминают ID платформы (`ARC-13`).
 */
export const RULE_PREFIXES = ['UI', 'PG', 'CH', 'TG', 'NM'] as const;

/** Номер правила с префиксом репо: `(UI|PG|CH|TG|NM)-NN`. */
const RULE_ID = `(?:${RULE_PREFIXES.join('|')})-\\d{2}`;

/** Сверка текстов: правила в коде и в `rules.md` (префиксы `RULE_PREFIXES`), ссылки `D-UI-<n>` и `decisions.md`, нумерация `debt.md`. Код пакета не импортирует. */
export class RuleCatalog {
  protected static readonly CODE_ID = new RegExp(
    `\\b(?:id\\s*=|rule\\s*:)\\s*'(${RULE_ID})'`,
  );
  protected static readonly ROW_ID = new RegExp(`^\\|\\s*\`?(${RULE_ID})\\b`);
  protected static readonly HEADING_ID = new RegExp(
    `^#{1,6}\\s.*?\\b(${RULE_ID})\\b`,
  );
  protected static readonly DECISION_REF = /D-UI-(\d+)/g;
  protected static readonly DECISION_DEF = /^\*\*D-UI-(\d+)\./;
  protected static readonly DEBT_LAST =
    /\*\*Последний выданный ID:\*\*\s*DEBT-UI-(\d+)/;
  protected static readonly DEBT_ID = /DEBT-UI-(\d+)/g;

  /**
   * Правила из кода — правила графа (`id = 'UI-NN'`) и слоёв (`rule: 'UI-NN'`
   * в слое или доступе) — и из каталога (заголовок или строка таблицы) должны
   * совпадать.
   */
  checkRules(code: SourceFile[], catalog: SourceFile): Violation[] {
    const inCatalog = new Map<string, number>();
    catalog.lines().forEach((text, index) => {
      const id =
        RuleCatalog.ROW_ID.exec(text)?.[1] ??
        RuleCatalog.HEADING_ID.exec(text)?.[1];
      if (id && !inCatalog.has(id)) inCatalog.set(id, index + 1);
    });
    const inCode = new Set<string>();
    const found: Violation[] = [];
    for (const file of code) {
      file.lines().forEach((text, index) => {
        const id = RuleCatalog.CODE_ID.exec(text)?.[1];
        if (!id) return;
        inCode.add(id);
        if (!inCatalog.has(id)) {
          found.push({
            file: file.path,
            line: index + 1,
            text: `${id}: правила нет в ${catalog.path}`,
          });
        }
      });
    }
    for (const [id, line] of inCatalog) {
      if (!inCode.has(id)) {
        found.push({
          file: catalog.path,
          line,
          text: `${id}: правила нет в коде`,
        });
      }
    }
    return found;
  }

  /** Каждое `D-UI-<n>` из `sources` определено записью `**D-UI-<n>. …**` в `decisions`. */
  checkDecisions(sources: SourceFile[], decisions: SourceFile): Violation[] {
    const defined = new Set(
      decisions
        .lines()
        .map((text) => RuleCatalog.DECISION_DEF.exec(text)?.[1])
        .filter((n): n is string => n !== undefined),
    );
    const found: Violation[] = [];
    for (const file of sources) {
      file.lines().forEach((text, index) => {
        for (const match of text.matchAll(RuleCatalog.DECISION_REF)) {
          if (!defined.has(match[1] ?? '')) {
            found.push({
              file: file.path,
              line: index + 1,
              text: `${match[0]}: решения нет в ${decisions.path}`,
            });
          }
        }
      });
    }
    return found;
  }

  /** «Последний выданный ID» в шапке `debt.md` равен максимальному `DEBT-UI-<n>` записей. */
  checkDebt(debt: SourceFile): Violation[] {
    let last: { n: number; line: number } | undefined;
    let max = 0;
    debt.lines().forEach((text, index) => {
      const header = RuleCatalog.DEBT_LAST.exec(text);
      if (header) {
        last = { n: Number(header[1]), line: index + 1 };
        return;
      }
      for (const match of text.matchAll(RuleCatalog.DEBT_ID)) {
        max = Math.max(max, Number(match[1]));
      }
    });
    if (!last) {
      return [
        {
          file: debt.path,
          line: 1,
          text: 'нет строки «Последний выданный ID: DEBT-UI-N»',
        },
      ];
    }
    if (max > 0 && last.n !== max) {
      return [
        {
          file: debt.path,
          line: last.line,
          text: `последний выданный DEBT-UI-${last.n}, максимум в записях DEBT-UI-${max}`,
        },
      ];
    }
    return [];
  }
}
