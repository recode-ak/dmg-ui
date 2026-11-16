import { describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { useTempDir } from 'dmg-core/testing';
import { SourceFile, SourceTree } from './source-tree';

const tmp = useTempDir('source-tree-');

describe('SourceFile', () => {
  it('номер строки по смещению — с 1', () => {
    expect(SourceFile.of('a.ts', 'a\nb\nc').lineAt(4)).toBe(3);
  });

  it('lines режет по переводу строки', () => {
    expect(SourceFile.of('a.ts', 'a\nb').lines()).toEqual(['a', 'b']);
  });
});

describe('SourceTree.read', () => {
  it('рекурсия, только .ts, пути от корня по алфавиту', () => {
    const dir = tmp();
    mkdirSync(dir.file('p/sub'), { recursive: true });
    writeFileSync(dir.file('p/b.ts'), 'b');
    writeFileSync(dir.file('p/a.ts'), 'a');
    writeFileSync(dir.file('p/sub/c.ts'), 'c');
    writeFileSync(dir.file('p/note.md'), '# n');
    const files = SourceTree.read(dir.path, 'p');
    expect(files.map((f) => f.path)).toEqual([
      'p/a.ts',
      'p/b.ts',
      'p/sub/c.ts',
    ]);
    expect(files[0]?.text).toBe('a');
  });

  it('node_modules пропускается', () => {
    const dir = tmp();
    mkdirSync(dir.file('p/node_modules/x'), { recursive: true });
    writeFileSync(dir.file('p/node_modules/x/a.ts'), 'a');
    expect(SourceTree.read(dir.path, 'p')).toEqual([]);
  });
});
