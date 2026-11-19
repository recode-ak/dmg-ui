import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { Browser } from './browser';

// Запускается только `bun run browser` (нужен Chrome); обычный `bun test`
// файл пропускает по корневому `bunfig.toml`. Без Chrome `Browser.launch()`
// бросает `ChromeNotFoundError`.

const SECONDS = 30_000;

/** Процесс жив? `kill(pid, 0)` без сигнала: ESRCH — процесса нет. */
const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

describe('Browser — клиент DevTools поверх настоящего Chrome', () => {
  test(
    'launch → newPage → evaluate("1+1") даёт 2',
    async () => {
      const browser = await Browser.launch();
      try {
        const page = await browser.newPage();

        expect(await page.evaluate<number>('1+1')).toBe(2);
      } finally {
        await browser.close();
      }
    },
    SECONDS,
  );

  test(
    'после close() процесса Chrome и каталога профиля нет',
    async () => {
      const browser = await Browser.launch();
      try {
        const { pid, profileDir } = browser;
        expect(alive(pid)).toBe(true);
        expect(existsSync(profileDir)).toBe(true);

        await browser.close();

        expect(alive(pid)).toBe(false);
        expect(existsSync(profileDir)).toBe(false);
      } finally {
        await browser.close();
      }
    },
    SECONDS,
  );

  test(
    'close() идемпотентен',
    async () => {
      const browser = await Browser.launch();

      await browser.close();
      await browser.close();
    },
    SECONDS,
  );

  test(
    'исключение в странице — бросок evaluate',
    async () => {
      const browser = await Browser.launch();
      try {
        const page = await browser.newPage();

        await expect(page.evaluate('throw new Error("взрыв")')).rejects.toThrow(
          'взрыв',
        );
      } finally {
        await browser.close();
      }
    },
    SECONDS,
  );
});
