import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { RULE_PREFIXES, RuleCatalog } from './rule-catalog';
import { SourceFile } from './source-tree';
import { TextTree } from './text-tree';

const ROOT = resolve(import.meta.dir, '..');
const SELF = ['checks/rule-catalog.test.ts', 'checks/rule-catalog.ts'];

const file = (path: string, text: string) => SourceFile.of(path, text);
const catalog = new RuleCatalog();
const format = (found: { file: string; line: number; text: string }[]) =>
  found.map((v) => `${v.file}:${v.line} ${v.text}`);

describe('RuleCatalog.checkRules — правила кода и rules.md', () => {
  const code = [
    file('r/a.rule.ts', "  readonly id = 'UI-01';"),
    file('r/b.rule.ts', "  readonly id = 'PG-02';"),
  ];

  it('заголовок и строка таблицы закрывают правила — нарушений нет', () => {
    const rules = file('rules.md', '## UI-01. Сторис\n\n| PG-02 | Вход |\n');
    expect(catalog.checkRules(code, rules)).toEqual([]);
  });

  it('правило из кода без записи — нарушение в файле кода', () => {
    const found = catalog.checkRules(code, file('rules.md', '## UI-01\n'));
    expect(found).toEqual([
      { file: 'r/b.rule.ts', line: 1, text: 'PG-02: правила нет в rules.md' },
    ]);
  });

  it('запись без правила в коде — нарушение в каталоге', () => {
    const rules = file('rules.md', '## UI-01\n| PG-02 |\n\n## UI-09\n');
    expect(catalog.checkRules(code, rules)).toEqual([
      { file: 'rules.md', line: 4, text: 'UI-09: правила нет в коде' },
    ]);
  });

  it('упоминание id в прозе записью не считается', () => {
    const rules = file('rules.md', '## UI-01\nсм. также PG-02 в тексте\n');
    expect(catalog.checkRules(code, rules)).toHaveLength(1);
  });

  it('id в обратных кавычках в строке таблицы находится', () => {
    const rules = file('rules.md', '| `UI-01` | а |\n| `PG-02` | б |\n');
    expect(catalog.checkRules(code, rules)).toEqual([]);
  });
});

describe('RuleCatalog.checkRules — префиксы правил', () => {
  const chat = [file('r/c.rule.ts', "  readonly id = 'CH-01';")];

  it('префикс вне списка (ARC-13 в заголовке) — не запись правила', () => {
    const rules = file('rules.md', '| CH-01 | а |\n\n## Префиксы (ARC-13)\n');
    expect(catalog.checkRules(chat, rules)).toEqual([]);
  });
});

describe('RuleCatalog.checkRules — все префиксы репо', () => {
  for (const prefix of RULE_PREFIXES) {
    it(`${prefix}: правило в коде без записи — нарушение в файле кода`, () => {
      const code = [file('r/x.rule.ts', `  readonly id = '${prefix}-01';`)];
      expect(catalog.checkRules(code, file('rules.md', '## Общее\n'))).toEqual([
        {
          file: 'r/x.rule.ts',
          line: 1,
          text: `${prefix}-01: правила нет в rules.md`,
        },
      ]);
    });

    it(`${prefix}: запись без правила в коде — нарушение в каталоге`, () => {
      const rules = file('rules.md', `## Общее\n| \`${prefix}-02\` | а |\n`);
      expect(catalog.checkRules([], rules)).toEqual([
        { file: 'rules.md', line: 2, text: `${prefix}-02: правила нет в коде` },
      ]);
    });
  }

  it('префиксы в id правил кода — ровно RULE_PREFIXES: новый префикс регистрируется', () => {
    const inCode = new Set(
      TextTree.read(ROOT, 'packages', ['.ts'])
        .filter((f) => f.path.endsWith('.rule.ts'))
        .flatMap((f) =>
          f.lines().flatMap((text) => {
            const prefix = /\bid\s*=\s*'([A-Z]+)-\d{2}'/.exec(text)?.[1];
            return prefix ? [prefix] : [];
          }),
        ),
    );
    expect([...inCode].sort()).toEqual([...RULE_PREFIXES].sort());
  });
});

describe('RuleCatalog.checkDecisions — D-UI в decisions.md', () => {
  const decisions = file(
    'docs/decisions.md',
    '**D-UI-1. Первое.** Причина.\n\n**D-UI-12. Второе.** Причина.\n',
  );

  it('определённые ссылки проходят', () => {
    const src = [file('a.ts', '// D-UI-1 и D-UI-12')];
    expect(catalog.checkDecisions(src, decisions)).toEqual([]);
  });

  it('неопределённая ссылка — нарушение с файлом и строкой', () => {
    const src = [file('a.ts', 'x\n// D-UI-99')];
    expect(catalog.checkDecisions(src, decisions)).toEqual([
      {
        file: 'a.ts',
        line: 2,
        text: 'D-UI-99: решения нет в docs/decisions.md',
      },
    ]);
  });

  it('D-UI-1 не считается определением D-UI-12 и наоборот', () => {
    const only12 = file('d.md', '**D-UI-12. Одно.**\n');
    expect(
      catalog.checkDecisions([file('a.ts', 'D-UI-1')], only12),
    ).toHaveLength(1);
  });

  it('упоминание в тексте записи не определяет решение', () => {
    const d = file('d.md', '**D-UI-1. Одно.** см. D-UI-2\n');
    expect(catalog.checkDecisions([file('a.ts', 'D-UI-2')], d)).toHaveLength(1);
  });
});

describe('RuleCatalog.checkDebt — нумерация debt.md', () => {
  const debt = (last: number, ids: number[]) =>
    file(
      'debt.md',
      `**Последний выданный ID:** DEBT-UI-${last}\n\n${ids
        .map((n) => `### DEBT-UI-${n}: запись`)
        .join('\n')}\n`,
    );

  it('шапка равна максимуму — нарушений нет', () => {
    expect(catalog.checkDebt(debt(5, [1, 3, 5]))).toEqual([]);
  });

  it('максимум выше шапки — нарушение', () => {
    const found = catalog.checkDebt(debt(3, [1, 5]));
    expect(found).toEqual([
      {
        file: 'debt.md',
        line: 1,
        text: 'последний выданный DEBT-UI-3, максимум в записях DEBT-UI-5',
      },
    ]);
  });

  it('шапка выше максимума — нарушение', () => {
    expect(catalog.checkDebt(debt(9, [1, 5]))).toHaveLength(1);
  });

  it('нет строки «Последний выданный ID» — нарушение', () => {
    const found = catalog.checkDebt(file('debt.md', '### DEBT-UI-1: х\n'));
    expect(found).toHaveLength(1);
  });

  it('число сравнивается как число, а не строка', () => {
    expect(catalog.checkDebt(debt(10, [2, 10]))).toEqual([]);
  });
});

describe('каталог правил и решения репо', () => {
  const read = (path: string) => {
    const found = TextTree.file(ROOT, path);
    expect(found).toBeDefined();
    return found ?? file(path, '');
  };
  const notSelf = (files: SourceFile[]) =>
    files.filter((f) => !SELF.includes(f.path));

  it('правила UI-NN, PG-NN, CH-NN и TG-NN в коде и в docs/reference/rules.md совпадают', () => {
    const code = TextTree.read(ROOT, 'packages', ['.ts']).filter(
      (f) => !f.path.endsWith('.test.ts'),
    );
    const rules = read('docs/reference/rules.md');
    expect(format(catalog.checkRules(code, rules))).toEqual([]);
  });

  it('каждое D-UI-<n> из кода и документов определено в docs/decisions.md', () => {
    const optional = ['README.md', 'llms.txt', 'debt.md'].flatMap((path) => {
      const f = TextTree.file(ROOT, path);
      return f ? [f] : [];
    });
    const sources = notSelf([
      ...TextTree.read(ROOT, 'packages', ['.ts', '.snap']),
      ...TextTree.read(ROOT, 'checks', ['.ts']),
      ...TextTree.read(ROOT, 'docs', ['.md']),
      ...optional,
    ]);
    const decisions = read('docs/decisions.md');
    expect(format(catalog.checkDecisions(sources, decisions))).toEqual([]);
  });

  it('debt.md: последний выданный ID равен максимуму', () => {
    expect(format(catalog.checkDebt(read('debt.md')))).toEqual([]);
  });
});
