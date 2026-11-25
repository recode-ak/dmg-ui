import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { useTempDir } from 'dmg-core/testing';
import { ExampleTokens } from './example-tokens';

// Файл пропусков принимается только обычным, своим и закрытым для группы и
// прочих: иначе чужой пользователь в каталоге с открытыми правами подложил бы
// известные значения годной формы.

const tmp = useTempDir('example-web-tokens-guard-');
const OWNER = process.getuid?.();
const planted = `${'A'.repeat(43)}`;
const forged = JSON.stringify({ anna: planted, boris: 'B'.repeat(43) });

describe('ExampleTokens.open — проверка файла', () => {
  test('права 0644: подложенные значения не приняты, выпуск заново, файл снова 0600', async () => {
    const file = tmp().file('tokens.json');
    writeFileSync(file, forged);
    chmodSync(file, 0o644);

    const tokens = await ExampleTokens.open(tmp().path, OWNER);

    expect(tokens.tokenOf('anna')).not.toBe(planted);
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  test('ссылка на месте файла: выпуск заново, цель ссылки не тронута', async () => {
    const target = tmp().file('target.json');
    writeFileSync(target, forged, { mode: 0o600 });
    symlinkSync(target, tmp().file('tokens.json'));

    const tokens = await ExampleTokens.open(tmp().path, OWNER);

    expect(tokens.tokenOf('anna')).not.toBe(planted);
    expect(readFileSync(target, 'utf8')).toBe(forged);
    expect(statSync(tmp().file('tokens.json')).isFile()).toBe(true);
  });

  test('чужой владелец (подставной uid): выпуск заново', async () => {
    const file = tmp().file('tokens.json');
    writeFileSync(file, forged, { mode: 0o600 });

    const tokens = await ExampleTokens.open(tmp().path, (OWNER ?? 0) + 1);

    expect(tokens.tokenOf('anna')).not.toBe(planted);
  });

  test('свой закрытый файл принимается', async () => {
    const file = tmp().file('tokens.json');
    writeFileSync(file, forged, { mode: 0o600 });
    chmodSync(file, 0o600);

    const tokens = await ExampleTokens.open(tmp().path, OWNER);

    expect(tokens.tokenOf('anna')).toBe(planted);
  });
});
