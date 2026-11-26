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

/** Сверка правил в коде и в `rules.md` (префиксы `RULE_PREFIXES`). Ссылки на записи реестров (`D-UI`, `GR-UI`, `DEBT-UI`) и нумерацию держит `dmg-core docs --check`. Код пакета не импортирует. */
export class RuleCatalog {
  protected static readonly CODE_ID = new RegExp(
    `\\b(?:id\\s*=|rule\\s*:)\\s*'(${RULE_ID})'`,
  );
  protected static readonly ROW_ID = new RegExp(`^\\|\\s*\`?(${RULE_ID})\\b`);
  protected static readonly HEADING_ID = new RegExp(
    `^#{1,6}\\s.*?\\b(${RULE_ID})\\b`,
  );

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
}
