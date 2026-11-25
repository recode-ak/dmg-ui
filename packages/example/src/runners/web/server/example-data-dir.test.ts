import { describe, expect, test } from 'bun:test';
import { chmodSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { useTempDir } from 'dmg-core/testing';
import { ExampleDataDir } from './example-data-dir';

// Каталог данных хранит пропуска: свой, обычный, у каталога по умолчанию —
// закрытый до 0700; заданный пользователем каталог права не меняет.

const tmp = useTempDir('example-web-data-dir-');
const OWNER = process.getuid?.();

describe('ExampleDataDir.prepare', () => {
  test('нет каталога — создаётся с правами 0700', async () => {
    const dir = tmp().file('data');

    await ExampleDataDir.prepare(dir, OWNER, true);

    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  test('ссылка на каталог на месте каталога — отказ', async () => {
    const real = tmp().file('real');
    await ExampleDataDir.prepare(real, OWNER, true);
    symlinkSync(real, tmp().file('link'));

    await expect(
      ExampleDataDir.prepare(tmp().file('link'), OWNER, true),
    ).rejects.toThrow();
  });

  test('не каталог — отказ', async () => {
    const file = tmp().file('plain');
    writeFileSync(file, 'x');

    await expect(ExampleDataDir.prepare(file, OWNER, true)).rejects.toThrow();
  });

  test('чужой владелец (подставной uid) — отказ без пути в тексте', async () => {
    const dir = tmp().file('data');

    const refusal = await ExampleDataDir.prepare(
      dir,
      (OWNER ?? 0) + 1,
      true,
    ).catch((error: Error) => error);

    expect(refusal).toBeInstanceOf(Error);
    expect((refusal as Error).message).not.toContain(dir);
  });

  test('открытые права: по умолчанию закрываются до 0700, у заданного каталога не меняются', async () => {
    const byDefault = tmp().file('default');
    const chosen = tmp().file('chosen');
    for (const dir of [byDefault, chosen]) {
      await ExampleDataDir.prepare(dir, OWNER, false);
      chmodSync(dir, 0o755);
    }

    await ExampleDataDir.prepare(byDefault, OWNER, true);
    await ExampleDataDir.prepare(chosen, OWNER, false);

    expect(statSync(byDefault).mode & 0o777).toBe(0o700);
    expect(statSync(chosen).mode & 0o777).toBe(0o755);
  });
});
