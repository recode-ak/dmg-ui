import { describe, expect, it } from 'bun:test';
import { ModuleSpecifiers } from './module-specifiers';
import { SourceFile } from './source-tree';

const list = (text: string) =>
  new ModuleSpecifiers(SourceFile.of('a.ts', text)).list();

describe('ModuleSpecifiers — разбор спецификаторов', () => {
  const forms: Array<[string, string]> = [
    ['import с привязками', "import { a } from 'x';"],
    ['import по умолчанию', "import a from 'x';"],
    ['import без привязок', "import 'x';"],
    ['import type', "import type { A } from 'x';"],
    ['require', "const a = require('x');"],
    ['export from', "export { a } from 'x';"],
    ['export * from', "export * from 'x';"],
    ['динамический import', "const m = await import('x');"],
    ['двойные кавычки', 'import "x";'],
    ['шаблон без интерполяции в import()', 'const m = await import(`x`);'],
  ];

  for (const [name, text] of forms) {
    it(`${name} даёт спецификатор`, () => {
      expect(list(text)).toEqual([{ specifier: 'x', line: 1 }]);
    });
  }

  it('шаблон с интерполяцией не разбирается', () => {
    const text = ['const m = await import(`x/', '$', '{name}`);'].join('');
    expect(list(text)).toEqual([]);
  });

  it('многострочный import — строка спецификатора', () => {
    expect(list("import {\n  a,\n  b,\n} from 'x';")).toEqual([
      { specifier: 'x', line: 4 },
    ]);
  });

  it('несколько спецификаторов — по строкам', () => {
    const found = list("import 'a';\n\nexport * from 'b';");
    expect(found).toEqual([
      { specifier: 'a', line: 1 },
      { specifier: 'b', line: 3 },
    ]);
  });
});
