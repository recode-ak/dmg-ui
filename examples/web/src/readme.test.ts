import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXAMPLE_PEOPLE } from './common/example-people.const';

// README примера и `.env.example` согласованы с кодом: переменные окружения,
// люди примера, структура чек-листа ручной проверки (группы и пункты, колонка
// «Итог» пустая). Ссылки на процесс, токены по форме и живые относительные
// ссылки README проверяют проверки репо (`checks/`) на реальном репо.

const ROOT = resolve(import.meta.dir, '..');
const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

const VARIABLES = [
  'EXAMPLE_WEB_PORT',
  'EXAMPLE_WEB_DELAY_MS',
  'EXAMPLE_WEB_DATA',
  'EXAMPLE_WEB_LOG',
];

/** Группы чек-листа (буквы — кириллица) и пункты каждой. */
const GROUPS: [string, string[]][] = [
  ['0', ['0.1', '0.2']],
  ['А', ['А1', 'А2', 'А3', 'А4', 'А5']],
  ['Б', ['Б1', 'Б2', 'Б3', 'Б4', 'Б5', 'Б6', 'Б7']],
  ['В', ['В1', 'В2', 'В3', 'В4', 'В5', 'В6', 'В7']],
  ['Г', ['Г1', 'Г2', 'Г3', 'Г4', 'Г5', 'Г6']],
  ['Д', ['Д1', 'Д2', 'Д3', 'Д4', 'Д5', 'Д6']],
  ['Е', ['Е1', 'Е2']],
  ['Ж', ['Ж1', 'Ж2']],
  ['З', ['З1', 'З2', 'З3', 'З4']],
];

/** Ячейки строки таблицы README, начинающейся с `| <id> |`; нет строки — `undefined`. */
const rowOf = (id: string): string[] | undefined => {
  const line = readme.split('\n').find((text) => text.startsWith(`| ${id} |`));
  return line
    ?.split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
};

describe('README примера и .env.example', () => {
  for (const name of VARIABLES) {
    test(`переменная ${name} описана в README`, () => {
      expect(readme).toContain(name);
    });
  }

  test('.env.example: каждая переменная объявлена строкой NAME= без значения', () => {
    const lines = readFileSync(resolve(ROOT, '.env.example'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

    expect(lines.sort()).toEqual(VARIABLES.map((name) => `${name}=`).sort());
  });

  test('люди примера: uuid и имена из EXAMPLE_PEOPLE есть в README', () => {
    expect(EXAMPLE_PEOPLE.length).toBeGreaterThan(0);
    for (const { uuid, name } of EXAMPLE_PEOPLE) {
      expect(readme).toContain(uuid);
      expect(readme).toContain(name);
    }
  });

  test('оговорки: проброс порта, localhost и 127.0.0.1, телефон', () => {
    expect(readme).toContain('ssh -L');
    expect(readme).toContain('localhost');
    expect(readme).toContain('127.0.0.1');
    expect(readme).toContain('adb reverse');
  });

  test('правило «Назначенные мне»: «Выполнить выбранные» исполняется, только если задачи назначены вам самим', () => {
    expect(readme).toContain('только если задачи назначены вам самим');
  });

  test('есть раздел «Что пример не проверяет»', () => {
    expect(readme).toMatch(/^#+ .*Что пример не проверяет/m);
  });
});

describe('README — чек-лист ручной проверки', () => {
  for (const [group, ids] of GROUPS) {
    test(`группа «${group}» — заголовок раздела`, () => {
      expect(readme).toMatch(new RegExp(`^### ${group}\\. `, 'm'));
    });

    for (const id of ids) {
      test(`пункт ${id}: строка таблицы из четырёх ячеек, «Итог» пуста`, () => {
        const cells = rowOf(id);

        expect(cells).toBeDefined();
        expect(cells).toHaveLength(4);
        expect(cells?.[1]).toBeTruthy();
        expect(cells?.[2]).toBeTruthy();
        expect(cells?.[3]).toBe('');
      });
    }
  }

  test('пунктов ровно 41: лишних идентификаторов в таблицах нет', () => {
    const rows = readme
      .split('\n')
      .filter((line) => /^\| (0\.\d|[А-Я]\d) \|/.test(line));

    expect(rows).toHaveLength(GROUPS.flatMap(([, ids]) => ids).length);
  });

  test('заголовок таблицы называет колонку «Итог»', () => {
    expect(readme).toMatch(
      /^\| № \| Шаг \| Что должно быть видно \| Итог \|$/m,
    );
  });
});
