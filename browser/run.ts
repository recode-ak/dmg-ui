import { resolve } from 'node:path';
import { ChromeLocator } from './chrome-locator';

// Раннер `bun run browser`: без Chrome тесты не стартуют (код 1 и подсказка),
// иначе запускает `bun test` по конфигу без игнора и с фильтром по суффиксу
// `.browser.test.ts` (D-UI-103). Окружение читает только раннер: ARC-09.

const ROOT = resolve(import.meta.dir, '..');

try {
  ChromeLocator.find(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const tests = Bun.spawn(
  [
    process.execPath,
    'test',
    '--config=browser/bunfig.toml',
    '.browser.test.ts',
  ],
  {
    cwd: ROOT,
    env: process.env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  },
);
process.exit(await tests.exited);
