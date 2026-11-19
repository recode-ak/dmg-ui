import { describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useTempDir } from 'dmg-core/testing';

// Браузерные тесты (`*.browser.test.ts`) не должны попадать в обычный
// `bun test` и `check`: им нужен Chrome. Проверка — настоящими процессами
// `bun test` во временном каталоге (TST-02) с копией корневого `bunfig.toml`.

const ROOT = resolve(import.meta.dir, '..');
const tmp = useTempDir('browser-split-');

type Config = { scripts?: Record<string, string>; engines?: { bun?: string } };
type TsConfig = { include?: string[] };

/** Временный проект: падающий браузерный тест (оставляет метку-файл) и зелёный обычный. */
const project = () => {
  const dir = tmp();
  copyFileSync(resolve(ROOT, 'bunfig.toml'), dir.file('bunfig.toml'));
  writeFileSync(
    dir.file('x.browser.test.ts'),
    `import { test } from 'bun:test';
import { writeFileSync } from 'node:fs';
test('браузерный', () => {
  writeFileSync(${JSON.stringify(dir.file('ran.flag'))}, '1');
  throw new Error('браузерный запущен');
});
`,
  );
  writeFileSync(
    dir.file('y.test.ts'),
    `import { expect, test } from 'bun:test';
test('обычный', () => { expect(1).toBe(1); });
`,
  );
  return dir;
};

const bunTest = async (cwd: string, args: string[]) => {
  const proc = Bun.spawn([process.execPath, 'test', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out: stdout + stderr, code };
};

describe('разделение обычных и браузерных тестов', () => {
  test('обычный bun test пропускает *.browser.test.ts и завершается кодом 0', async () => {
    const dir = project();

    const { code, out } = await bunTest(dir.path, []);

    expect(out).not.toContain('браузерный запущен');
    expect(existsSync(dir.file('ran.flag'))).toBe(false);
    expect(code).toBe(0);
  });

  test('browser/bunfig.toml с фильтром .browser.test.ts запускает браузерный файл', async () => {
    const dir = project();

    const { code } = await bunTest(dir.path, [
      `--config=${resolve(ROOT, 'browser/bunfig.toml')}`,
      '.browser.test.ts',
    ]);

    expect(existsSync(dir.file('ran.flag'))).toBe(true);
    expect(code).not.toBe(0);
  });

  test('корневой bunfig.toml содержит шаблон игнора', () => {
    const text = readFileSync(resolve(ROOT, 'bunfig.toml'), 'utf8');

    expect(text).toContain('pathIgnorePatterns');
    expect(text).toContain('**/*.browser.test.ts');
  });

  test('в package.json есть скрипт browser, в check его нет', () => {
    const scripts =
      (
        JSON.parse(
          readFileSync(resolve(ROOT, 'package.json'), 'utf8'),
        ) as Config
      ).scripts ?? {};

    expect(scripts.browser).toBe('bun browser/run.ts');
    expect(scripts.check).toBeDefined();
    expect(scripts.check).not.toContain('browser');
  });

  test('tsconfig.json include содержит browser', () => {
    const config = JSON.parse(
      readFileSync(resolve(ROOT, 'tsconfig.json'), 'utf8'),
    ) as TsConfig;

    expect(config.include).toContain('browser');
  });
});
