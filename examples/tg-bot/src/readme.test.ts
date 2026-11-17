import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXAMPLE_USER_A, EXAMPLE_USER_B } from './example-bot.const';
import { PROBE_CASES } from './example-probe.const';

// README примера и `.env.example` согласованы с кодом: переменные окружения,
// uuid учебных пользователей, пробы группы Е. Ссылки на трек, токен и живые
// относительные ссылки README уже проверяют `track-references.test.ts`,
// `bot-token-scanner.test.ts` и `docs-links.test.ts` на реальном репо (TST-08).

const ROOT = resolve(import.meta.dir, '..');
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

/** Переменные окружения, которые читает `ExampleEnv` (ARC-09: читает их `main.ts`). */
const VARIABLES = [
  'EXAMPLE_TG_TOKEN',
  'EXAMPLE_TG_USERS',
  'EXAMPLE_TG_LOG',
  'EXAMPLE_TG_TRACE',
  'EXAMPLE_TG_DATA',
];

describe('README примера и .env.example', () => {
  test.each(VARIABLES)('переменная %s описана в README', (name) => {
    expect(readme).toContain(name);
  });

  test('.env.example: каждая переменная объявлена строкой NAME= без значения', () => {
    const lines = readFileSync(resolve(ROOT, '.env.example'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    expect(lines.sort()).toEqual(VARIABLES.map((name) => `${name}=`).sort());
  });

  test('uuid учебных пользователей A и B из example-bot.const.ts есть в README', () => {
    expect(readme).toContain(EXAMPLE_USER_A);
    expect(readme).toContain(EXAMPLE_USER_B);
  });

  test('каждая проба PROBE_CASES (группа Е) названа в README по id', () => {
    for (const probeCase of PROBE_CASES) {
      expect({
        id: probeCase.id,
        found: readme.includes(probeCase.id),
      }).toEqual({ id: probeCase.id, found: true });
    }
  });
});
