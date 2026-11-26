import { describe, expect, it } from 'bun:test';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile } from './source-tree';

// Зона пакета `gen`: код вида генератора работает с текстом и файлами, из
// пакетов знает только `dmg-core/gen`; рантайм UI и входы каналов в процесс
// `gen` не попадают. Тесты пакета в зону не входят.

const scan = (text: string, path: string) =>
  CoreImportScanner.standard().scan([SourceFile.of(path, text)]);

describe('CoreImportScanner — вид генератора (packages/gen/src/)', () => {
  const KIND = 'packages/gen/src/ui-module-kind.ts';

  it('разрешены node:path, node:fs и dmg-core/gen', () => {
    const text = [
      "import { join, relative } from 'node:path';",
      "import { readFileSync } from 'node:fs';",
      "import { GenError } from 'dmg-core/gen';",
      "import type { GenProviderKind } from 'dmg-core/gen';",
      "import { UiName } from './ui-name';",
    ].join('\n');

    expect(scan(text, KIND)).toEqual([]);
  });

  for (const text of [
    "import { UiModuleDef } from 'dmg-ui';",
    "import { ChatViews } from 'dmg-ui/chat-ui';",
    "import { DmgCoreCli } from 'dmg-core/cli';",
  ]) {
    it(`${text} в виде генератора — нарушение`, () => {
      expect(scan(text, KIND)).toHaveLength(1);
    });
  }

  it('*.test.ts пакета не в зоне: тесты берут dmg-core/cli и dmg-ui/testing', () => {
    const text = [
      "import { DmgCoreCli } from 'dmg-core/cli';",
      "import { UiFileNames } from 'dmg-ui/testing';",
    ].join('\n');

    expect(scan(text, 'packages/gen/src/ui-module-kind.cli.test.ts')).toEqual(
      [],
    );
  });
});
