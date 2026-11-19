import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

// Раннер без Chrome: `CHROME_BIN` указывает в никуда, PATH пуст — поиск имён
// ничего не находит. `process.execPath` абсолютный, пустой PATH Bun не мешает.

const ROOT = resolve(import.meta.dir, '..');

describe('browser/run.ts — Chrome не найден', () => {
  test('код 1, сообщение с CHROME_BIN в stderr, тесты не запускались', async () => {
    const proc = Bun.spawn([process.execPath, 'browser/run.ts'], {
      cwd: ROOT,
      env: { CHROME_BIN: '/нет/такого', PATH: '' },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    expect(code).toBe(1);
    expect(stderr).toContain('CHROME_BIN');
    expect(stderr).toContain('/нет/такого');
    expect(stdout + stderr).not.toMatch(/\d+ pass/);
    expect(stdout + stderr).not.toContain('bun test v');
  });
});
