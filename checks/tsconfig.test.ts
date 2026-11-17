import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Общий tsconfig не знает браузера: типы DOM подключает только пакет, который
// собирается под браузер, иначе они протекли бы в код сервера и каналов.

const ROOT = resolve(import.meta.dir, '..');

const options = (): { lib?: string[]; types?: string[] } =>
  (
    JSON.parse(readFileSync(join(ROOT, 'tsconfig.json'), 'utf8')) as {
      compilerOptions: { lib?: string[]; types?: string[] };
    }
  ).compilerOptions;

describe('общий tsconfig.json — без типов браузера', () => {
  it('lib без DOM', () => {
    const lib = options().lib ?? [];

    expect(lib.length).toBeGreaterThan(0);
    expect(lib.filter((name) => /^dom/i.test(name))).toEqual([]);
  });

  it('types без dom', () => {
    const types = options().types ?? [];

    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((name) => /dom/i.test(name))).toEqual([]);
  });
});
