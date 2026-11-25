import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Общий tsconfig не знает браузера: типы DOM подключает только пакет, который
// собирается под браузер, иначе они протекли бы в код сервера и каналов.
// DOM-клиент раннера web учебного проекта — своя программа с DOM; корневая
// его не видит.

const ROOT = resolve(import.meta.dir, '..');

type Config = {
  compilerOptions?: { lib?: string[]; types?: string[] };
  include?: string[];
  exclude?: string[];
};

const config = (path: string): Config =>
  JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as Config;

const options = (): { lib?: string[]; types?: string[] } =>
  config('tsconfig.json').compilerOptions ?? {};

const WEB_RUNNER = 'packages/example/src/runners/web';
const EXAMPLE_WEB = `${WEB_RUNNER}/tsconfig.json`;

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

describe('tsconfig.json раннера web — программа клиента с DOM', () => {
  it('exclude пуст: унаследованный из общего скрыл бы клиент', () => {
    expect(config(EXAMPLE_WEB).exclude).toEqual([]);
  });

  it('include — клиент, DOM-помощники и общее, без сервера', () => {
    const include = config(EXAMPLE_WEB).include ?? [];

    expect(include).toContain('client');
    expect(include).toContain('view');
    expect(include).toContain('common');
    expect(include.filter((path) => path.includes('server'))).toEqual([]);
  });

  it('корневая программа исключает клиент раннера web', () => {
    expect(config('tsconfig.json').exclude).toEqual([`${WEB_RUNNER}/client`]);
  });
});

describe('общий tsconfig.json — браузерный клиент DevTools', () => {
  it('include содержит browser: клиент и раннер проверяются tsc', () => {
    expect(config('tsconfig.json').include ?? []).toContain('browser');
  });

  it('include по-прежнему содержит packages, checks и acceptance', () => {
    const include = config('tsconfig.json').include ?? [];

    for (const path of ['packages', 'checks', 'acceptance']) {
      expect(include).toContain(path);
    }
  });
});
