import { describe, expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { useTempDir } from 'dmg-core/testing';
import { ChromeLocator, ChromeNotFoundError } from './chrome-locator';

// Окружение и поиск в PATH подставные: тест не зависит от Chrome машины.

const tmp = useTempDir('chrome-locator-');

/** `which`, знающий только перечисленные имена. */
const whichOf =
  (known: Record<string, string>) =>
  (name: string): string | null =>
    known[name] ?? null;

const NAMES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
];

describe('ChromeLocator.find', () => {
  test('CHROME_BIN побеждает имена из PATH', () => {
    const bin = tmp().file('my-chrome');
    writeFileSync(bin, '');

    const found = ChromeLocator.find(
      { CHROME_BIN: bin },
      whichOf({ 'google-chrome-stable': '/usr/bin/google-chrome-stable' }),
    );

    expect(found).toBe(bin);
  });

  test('CHROME_BIN на несуществующий файл — ошибка с путём', () => {
    const missing = tmp().file('нет-такого');

    expect(() =>
      ChromeLocator.find(
        { CHROME_BIN: missing },
        whichOf({ chromium: '/usr/bin/chromium' }),
      ),
    ).toThrow(missing);
  });

  test('без CHROME_BIN — первое найденное имя по порядку списка, google-chrome-stable — первое', () => {
    const second = ChromeLocator.find(
      {},
      whichOf({
        chromium: '/usr/bin/chromium',
        'google-chrome': '/usr/bin/google-chrome',
      }),
    );
    const first = ChromeLocator.find(
      {},
      whichOf({
        'google-chrome-stable': '/a/stable',
        'google-chrome': '/a/plain',
        chromium: '/a/chromium',
        'chromium-browser': '/a/browser',
      }),
    );

    expect(second).toBe('/usr/bin/google-chrome');
    expect(first).toBe('/a/stable');
  });

  test('chromium-browser — последнее в списке, берётся, если других нет', () => {
    const found = ChromeLocator.find(
      {},
      whichOf({ 'chromium-browser': '/a/browser' }),
    );

    expect(found).toBe('/a/browser');
  });

  test('ничего нет — ChromeNotFoundError с CHROME_BIN и списком имён', () => {
    let caught: unknown;
    try {
      ChromeLocator.find({}, whichOf({}));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ChromeNotFoundError);
    const message = (caught as Error).message;
    expect(message).toContain('Chrome не найден');
    expect(message).toContain('CHROME_BIN');
    for (const name of NAMES) expect(message).toContain(name);
  });

  test('пустой CHROME_BIN считается незаданным', () => {
    const found = ChromeLocator.find(
      { CHROME_BIN: '' },
      whichOf({ chromium: '/usr/bin/chromium' }),
    );

    expect(found).toBe('/usr/bin/chromium');
  });
});
