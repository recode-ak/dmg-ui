import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Общий tsconfig не знает браузера: типы DOM подключает только пакет, который
// собирается под браузер, иначе они протекли бы в код сервера и каналов.
// Клиент примера для браузера — своя программа с DOM; корневая её не видит.

const ROOT = resolve(import.meta.dir, '..');

type Config = {
  extends?: string;
  compilerOptions?: { lib?: string[]; types?: string[] };
  include?: string[];
  exclude?: string[];
};

const config = (path: string): Config =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Config;

const options = (): { lib?: string[]; types?: string[] } =>
  config('tsconfig.json').compilerOptions ?? {};

const EXAMPLE_WEB = 'examples/web/tsconfig.json';

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

describe('общий tsconfig.json — клиент примера вне корневой программы', () => {
  it('exclude содержит examples/web/src/client', () => {
    expect(config('tsconfig.json').exclude ?? []).toContain(
      'examples/web/src/client',
    );
  });
});

describe('examples/web/tsconfig.json — программа клиента с DOM', () => {
  it('файл есть и расширяет общий', () => {
    expect(existsSync(join(ROOT, EXAMPLE_WEB))).toBe(true);
    expect(config(EXAMPLE_WEB).extends).toBe('../../tsconfig.json');
  });

  it('lib содержит DOM и ESNext', () => {
    const lib = (config(EXAMPLE_WEB).compilerOptions?.lib ?? []).map((name) =>
      name.toLowerCase(),
    );

    expect(lib).toContain('dom');
    expect(lib).toContain('esnext');
  });

  it('types содержит bun и node: типовой граф входов пакета тянет серверные типы', () => {
    const types = config(EXAMPLE_WEB).compilerOptions?.types ?? [];

    expect(types).toContain('bun');
    expect(types).toContain('node');
  });

  it('exclude пуст: унаследованный из общего скрыл бы клиент', () => {
    expect(config(EXAMPLE_WEB).exclude).toEqual([]);
  });

  it('include — клиент, модели представлений и общее, без сервера', () => {
    const include = config(EXAMPLE_WEB).include ?? [];

    expect(include).toContain('src/client');
    expect(include).toContain('src/view');
    expect(include).toContain('src/common');
    expect(include.filter((path) => path.includes('server'))).toEqual([]);
  });
});
