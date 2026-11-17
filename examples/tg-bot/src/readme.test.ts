import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXAMPLE_USER_A, EXAMPLE_USER_B } from './example-bot.const';
import { EXAMPLE_VARIABLES } from './example-env.const';
import { PROBE_CASES } from './example-probe.const';
import type { ProbeCase } from './example-probe.types';

// README примера и `.env.example` согласованы с кодом: переменные окружения,
// uuid учебных пользователей, пробы группы Е. Ссылки на трек, токен и живые
// относительные ссылки README уже проверяют `track-references.test.ts`,
// `bot-token-scanner.test.ts` и `docs-links.test.ts` на реальном репо (TST-08).

const ROOT = resolve(import.meta.dir, '..');
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

/** Строка таблицы README целиком по началу: `| id. look | expected |` (Е1 не засчитывается за Е10). */
const hasRow = (text: string, probeCase: ProbeCase): boolean =>
  text
    .split('\n')
    .some((line) =>
      line.startsWith(
        `| ${probeCase.id}. ${probeCase.look} | ${probeCase.expected} |`,
      ),
    );

describe('README примера и .env.example', () => {
  test.each(EXAMPLE_VARIABLES)('переменная %s описана в README', (name) => {
    expect(readme).toContain(name);
  });

  test('.env.example: каждая переменная объявлена строкой NAME= без значения', () => {
    const lines = readFileSync(resolve(ROOT, '.env.example'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    expect(lines.sort()).toEqual(
      EXAMPLE_VARIABLES.map((name) => `${name}=`).sort(),
    );
  });

  test('uuid учебных пользователей A и B из example-bot.const.ts есть в README', () => {
    expect(readme).toContain(EXAMPLE_USER_A);
    expect(readme).toContain(EXAMPLE_USER_B);
  });

  test('каждая проба PROBE_CASES (группа Е) есть в таблице README строкой целиком', () => {
    for (const probeCase of PROBE_CASES) {
      expect({
        id: probeCase.id,
        found: hasRow(readme, probeCase),
      }).toEqual({ id: probeCase.id, found: true });
    }
  });

  test('строка Е10 не засчитывается за пробу Е1', () => {
    const [first, tenth] = [PROBE_CASES[0], PROBE_CASES[9]];
    expect(first?.id).toBe('Е1');
    expect(tenth?.id).toBe('Е10');
    const onlyTenth = `| ${tenth?.id}. ${tenth?.look} | ${tenth?.expected} | x | |`;
    expect(hasRow(onlyTenth, tenth as ProbeCase)).toBe(true);
    expect(hasRow(onlyTenth, first as ProbeCase)).toBe(false);
  });
});
