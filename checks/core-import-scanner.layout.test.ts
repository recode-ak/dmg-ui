import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { CoreImportScanner } from './core-import-scanner';
import { SourceFile, SourceTree } from './source-tree';

// Страж раскладки: каждый `.ts`-файл пакетов каналов лежит в каталоге с зоной
// сканера импортов (`src/` или `testing/`), иначе он остался бы непроверенным.

const ROOT = resolve(import.meta.dir, '..');

const files = (...paths: string[]) =>
  paths.map((path) => SourceFile.of(path, ''));

describe('CoreImportScanner.scanLayout — файлы пакетов каналов лежат в известных каталогах', () => {
  it('src/ и testing/ обоих пакетов проходят', () => {
    expect(
      CoreImportScanner.scanLayout(
        files(
          'packages/chat-ui/src/index.ts',
          'packages/chat-ui/testing/example/a.ts',
          'packages/tg-bot/src/index.ts',
          'packages/tg-bot/testing/index.ts',
          'packages/core/anything.ts',
        ),
      ),
    ).toEqual([]);
  });

  it('файл в корне пакета — нарушение с призывом добавить зону', () => {
    const found = CoreImportScanner.scanLayout(
      files('packages/chat-ui/index.ts'),
    );

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: 'packages/chat-ui/index.ts' });
    expect(found[0]?.text).toContain('добавь зону');
  });

  it('файл в новом подкаталоге пакета — нарушение', () => {
    expect(
      CoreImportScanner.scanLayout(files('packages/tg-bot/scripts/run.ts')),
    ).toHaveLength(1);
  });

  it('каталог с похожим именем (src-old) — нарушение', () => {
    expect(
      CoreImportScanner.scanLayout(files('packages/tg-bot/src-old/a.ts')),
    ).toHaveLength(1);
  });

  it('на реальном репо — ноль нарушений', () => {
    const real = [
      ...SourceTree.read(ROOT, 'packages/chat-ui'),
      ...SourceTree.read(ROOT, 'packages/tg-bot'),
    ];
    expect(real.length).toBeGreaterThan(0);
    expect(CoreImportScanner.scanLayout(real)).toEqual([]);
  });
});
