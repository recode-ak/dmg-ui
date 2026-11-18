import { timingSafeEqual } from 'node:crypto';
import { lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EXAMPLE_PEOPLE } from '../common/example-people.const';
import {
  TOKEN_BYTES,
  TOKEN_SHAPE,
  TOKENS_FILE,
  TOKENS_MODE,
} from './example-tokens.const';

/**
 * Пропуска людей примера: по одному на человека, 32 случайных байта в
 * base64url, в `tokens.json` (права `0600`); переживают перезапуск сервера.
 * Файл не принят (нет, не JSON, чужие значения, не обычный, чужой, открытый
 * для группы и прочих) — выпуск заново. Пропуск — только в `Set-Cookie` входа.
 */
export class ExampleTokens {
  protected constructor(
    protected readonly byKey: ReadonlyMap<string, string>,
  ) {}

  /** Пропуска из каталога `dir`; нет годных — выпуск и запись заново. */
  static async open(dir: string, uid?: number): Promise<ExampleTokens> {
    const file = join(dir, TOKENS_FILE);
    const stored = await ExampleTokens.read(file, uid);
    if (stored !== undefined) return new ExampleTokens(stored);
    const issued = new Map(
      EXAMPLE_PEOPLE.map(({ key }) => [key, ExampleTokens.issue()] as const),
    );
    await ExampleTokens.write(file, issued);
    return new ExampleTokens(issued);
  }

  /** Пропуск человека по ключу; нет такого человека — `undefined`. */
  tokenOf(key: string): string | undefined {
    return this.byKey.get(key);
  }

  /** Ключ человека по пропуску; чужой пропуск — `undefined`. */
  keyOf(token: string): string | undefined {
    let found: string | undefined;
    // Без раннего выхода: время не зависит от того, чей пропуск и сколько знаков совпало.
    for (const [key, own] of this.byKey) {
      if (ExampleTokens.same(own, token)) found = key;
    }
    return found;
  }

  /** `uuid` учебного пользователя по пропуску: порт `tokens` хоста страниц. */
  async personOf(token: string): Promise<string | undefined> {
    const key = this.keyOf(token);
    return EXAMPLE_PEOPLE.find((person) => person.key === key)?.uuid;
  }

  protected static issue(): string {
    return Buffer.from(
      crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)),
    ).toString('base64url');
  }

  protected static same(own: string, given: string): boolean {
    const a = Buffer.from(own);
    const b = Buffer.from(given);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Годные пропуска из файла; нет файла, не JSON, не те значения или повтор — `undefined`. */
  protected static async read(
    file: string,
    uid: number | undefined,
  ): Promise<Map<string, string> | undefined> {
    let parsed: unknown;
    try {
      const stat = await lstat(file);
      if (!stat.isFile() || (stat.mode & 0o077) !== 0) return undefined;
      if (uid !== undefined && stat.uid !== uid) return undefined;
      parsed = JSON.parse(await readFile(file, 'utf8'));
    } catch {
      return undefined;
    }
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const record = parsed as Record<string, unknown>;
    const tokens = new Map<string, string>();
    for (const { key } of EXAMPLE_PEOPLE) {
      const value = Object.hasOwn(record, key) ? record[key] : undefined;
      if (typeof value !== 'string' || !TOKEN_SHAPE.test(value)) {
        return undefined;
      }
      tokens.set(key, value);
    }
    return new Set(tokens.values()).size === tokens.size ? tokens : undefined;
  }

  /** Запись с правами `0600` с первой секунды: старый файл удаляется, новый создаётся только если его нет. */
  protected static async write(
    file: string,
    tokens: ReadonlyMap<string, string>,
  ): Promise<void> {
    await rm(file, { force: true });
    await writeFile(file, JSON.stringify(Object.fromEntries(tokens)), {
      mode: TOKENS_MODE,
      flag: 'wx',
    });
  }
}
