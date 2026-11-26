import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { RULE_PREFIXES, RuleCatalog } from './rule-catalog';
import { SourceFile } from './source-tree';
import { TextTree } from './text-tree';

const ROOT = resolve(import.meta.dir, '..');

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

describe('RuleCatalog.checkRules — ID слоёв в коде', () => {
  const layers = [file('graph/ui-layers.ts', "    rule: 'UI-28',")];

  it('ID слоя rule: UI-28 в коде без записи — нарушение в файле кода', () => {
    const found = catalog.checkRules(layers, file('rules.md', '## Общее\n'));
    expect(found).toEqual([
      {
        file: 'graph/ui-layers.ts',
        line: 1,
        text: 'UI-28: правила нет в rules.md',
      },
    ]);
  });

  it('ID слоя rule: UI-28 и строка таблицы — нарушений нет', () => {
    const rules = file('rules.md', '| UI-28 | Описание фронта |\n');
    expect(catalog.checkRules(layers, rules)).toEqual([]);
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
        .filter((f) => !f.path.endsWith('.test.ts'))
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

describe('каталог правил репо', () => {
  const read = (path: string) => {
    const found = TextTree.file(ROOT, path);
    expect(found).toBeDefined();
    return found ?? file(path, '');
  };

  it('правила UI-NN, PG-NN, CH-NN, TG-NN и NM-NN в коде и в docs/reference/rules.md совпадают', () => {
    const code = TextTree.read(ROOT, 'packages', ['.ts']).filter(
      (f) => !f.path.endsWith('.test.ts'),
    );
    const rules = read('docs/reference/rules.md');
    expect(format(catalog.checkRules(code, rules))).toEqual([]);
  });
});
