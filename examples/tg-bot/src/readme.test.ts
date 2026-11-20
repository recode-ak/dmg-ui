import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TaskListScreenDef, UserCardScreenDef } from 'dmg-ui/testing';
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
});

/** Пункты группы «Ж. Отключённое, поля, справка, „Назад“» (буква — кириллица). */
const GROUP_Ж = ['Ж1', 'Ж2', 'Ж3', 'Ж4', 'Ж5', 'Ж6', 'Ж7', 'Ж8'];

/** Ячейки строки таблицы README, чья первая ячейка начинается с `<id>.`; нет строки — `undefined`. */
const rowOf = (id: string): string[] | undefined => {
  const line = readme.split('\n').find((text) => text.startsWith(`| ${id}.`));
  return line
    ?.split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
};

describe('README примера — группа Ж и подписи из Def', () => {
  test('есть заголовок группы «### Ж. »', () => {
    expect(readme).toMatch(/^### Ж\. /m);
  });

  test.each(GROUP_Ж)(
    'пункт %s — строка таблицы из четырёх ячеек, «Итог» пуста',
    (id) => {
      const cells = rowOf(id);

      expect(cells).toHaveLength(4);
      expect(cells?.[0]).toStartWith(`${id}. `);
      expect(cells?.[1]).not.toBe('');
      expect(cells?.[3]).toBe('');
    },
  );

  test('подписи из Def: «Предыдущая страница» и «К моим задачам» названы в README', () => {
    expect(readme).toContain(TaskListScreenDef.actions.prev.label);
    expect(readme).toContain(UserCardScreenDef.actions.tasks.label);
  });

  test('Ж4 называет /help, Ж1 — ответ на нажатие без show_alert', () => {
    expect(rowOf('Ж4')?.[0]).toContain('/help');
    expect(rowOf('Ж1')?.[1]).toContain('show_alert');
  });

  test('Б1: «Итог» сброшена', () => {
    expect(rowOf('Б1')?.[3]).toBe('');
  });

  test('Б3 называет листание подписью из Def, а не «Назад»; «Итог» сброшена', () => {
    const cells = rowOf('Б3');

    expect(cells?.[0]).toContain(TaskListScreenDef.actions.prev.label);
    expect(cells?.[0]).not.toContain('«Назад»');
    expect(cells?.[3]).toBe('');
  });
});
