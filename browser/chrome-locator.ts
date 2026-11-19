import { existsSync } from 'node:fs';

/** Имена исполняемого файла Chrome в `PATH` — в порядке предпочтения. */
const CHROME_NAMES = [
  'google-chrome-stable',
  'google-chrome',
  'chromium',
  'chromium-browser',
];

/** Chrome не найден ни по `CHROME_BIN`, ни по именам в `PATH`. */
export class ChromeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChromeNotFoundError';
  }
}

/** Поиск исполняемого файла Chrome: `CHROME_BIN`, затем имена из `PATH`. */
export class ChromeLocator {
  protected constructor(
    protected readonly env: Record<string, string | undefined>,
    protected readonly which: (name: string) => string | null,
  ) {}

  /**
   * Путь к Chrome. Непустой `CHROME_BIN` побеждает и обязан указывать на
   * существующий файл; иначе — первое найденное имя из списка. Окружение и
   * поиск в `PATH` — параметры: раннер подставляет настоящие, тесты — свои.
   */
  static find(
    env: Record<string, string | undefined>,
    which: (name: string) => string | null = Bun.which,
  ): string {
    return new ChromeLocator(env, which).locate();
  }

  protected locate(): string {
    const given = this.env.CHROME_BIN;
    if (given !== undefined && given !== '') {
      if (!existsSync(given)) {
        throw new ChromeNotFoundError(
          `CHROME_BIN указывает на несуществующий файл: ${given}`,
        );
      }
      return given;
    }
    for (const name of CHROME_NAMES) {
      const found = this.which(name);
      if (found !== null) return found;
    }
    throw new ChromeNotFoundError(
      `Chrome не найден: искали CHROME_BIN, ${CHROME_NAMES.join(', ')}; задайте CHROME_BIN`,
    );
  }
}
