import { describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { useTempDir } from 'dmg-core/testing';
import { GuideTaskChecker } from './guide-tasks';
import { SourceFile } from './source-tree';
import { TextTree } from './text-tree';

const ROOT = resolve(import.meta.dir, '..');
const GUIDE = 'docs/guides/frontend-tasks.md';
const tmp = useTempDir('guide-tasks-');

/** Образец теста и кода: общие файлы временного репо. */
const FILES = {
  'acceptance/a.test.ts': "describe('сценарий 1 — выбор', () => {});\n",
  'src/screen.ts': [
    'export const Screen = {',
    '  label: "Список",',
    '  actions: {',
    '    open: { label: "Открыть" },',
    '    close: { label: "Закрыть" },',
    '  },',
    '};',
    '',
  ].join('\n'),
};

/** Временный репо с файлами и проверка гайда `text` (путь `docs/guides/frontend-tasks.md`). */
const checkGuide = (text: string, files: Record<string, string> = FILES) => {
  const dir = tmp();
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(dir.file(path)), { recursive: true });
    writeFileSync(dir.file(path), content);
  }
  return new GuideTaskChecker(dir.path).check(SourceFile.of(GUIDE, text));
};

const texts = (text: string, files?: Record<string, string>) =>
  checkGuide(text, files).map((v) => `${v.line}: ${v.text}`);

const LIVE = '[a.test.ts](../../acceptance/a.test.ts) — «сценарий 1»';
const scenario = (proof: string) => `### 1. Выбор\n\nЧто хотим.\n\n${proof}\n`;

describe('GuideTaskChecker — строки «Проверено:» сценариев', () => {
  it('живая ссылка и найденный фрагмент — без нарушений', () => {
    expect(checkGuide(scenario(`Проверено: ${LIVE}`))).toEqual([]);
  });

  it('несколько пар в одной строке: проверяется каждая', () => {
    const proof =
      'Проверено: [a.test.ts](../../acceptance/a.test.ts) — «сценарий 1», «выбор»; ' +
      '[screen.ts](../../src/screen.ts) — «Закрыть»';
    expect(checkGuide(scenario(proof))).toEqual([]);
  });

  it('мёртвая ссылка — нарушение с номером строки', () => {
    const proof =
      'Проверено: [x](../../acceptance/none.test.ts) — «сценарий 1»';
    expect(texts(scenario(proof))).toEqual([
      '5: ../../acceptance/none.test.ts: файл не найден',
    ]);
  });

  it('фрагмента нет в файле — нарушение', () => {
    const proof =
      'Проверено: [a.test.ts](../../acceptance/a.test.ts) — «сценарий 9»';
    expect(texts(scenario(proof))).toEqual([
      '5: ../../acceptance/a.test.ts: фрагмент «сценарий 9» не найден',
    ]);
  });

  it('вторая пара строки не находит фрагмент — нарушение только на ней', () => {
    const proof =
      'Проверено: [a.test.ts](../../acceptance/a.test.ts) — «сценарий 1»; ' +
      '[screen.ts](../../src/screen.ts) — «Удалить»';
    expect(texts(scenario(proof))).toEqual([
      '5: ../../src/screen.ts: фрагмент «Удалить» не найден',
    ]);
  });

  it('ссылка без фрагмента — нарушение', () => {
    const proof = 'Проверено: [a.test.ts](../../acceptance/a.test.ts)';
    expect(texts(scenario(proof))).toEqual([
      '5: ../../acceptance/a.test.ts: нет фрагмента в кавычках',
    ]);
  });

  it('строка «Проверено:» без ссылок — нарушение', () => {
    expect(texts(scenario('Проверено: потом'))).toEqual([
      '5: «Проверено:» без ссылки на тест',
    ]);
  });

  it('фрагмент из одних пробелов — нарушение', () => {
    const proof = 'Проверено: [a.test.ts](../../acceptance/a.test.ts) — «  »';
    expect(texts(scenario(proof))).toEqual([
      '5: ../../acceptance/a.test.ts: пустой фрагмент',
    ]);
  });

  it('ссылка за пределы репо — нарушение, файл не читается', () => {
    const proof = 'Проверено: [x](../../../outside.test.ts) — «сценарий 1»';
    expect(texts(scenario(proof))).toEqual([
      '5: ../../../outside.test.ts: путь вне репо',
    ]);
  });

  it('фрагмент ищется подстрокой по всему файлу: «сценарий 1» находится и в «сценарий 10»', () => {
    const files = {
      'acceptance/a.test.ts': "describe('сценарий 10', () => {});",
    };
    const proof =
      'Проверено: [a.test.ts](../../acceptance/a.test.ts) — «сценарий 1»';
    expect(checkGuide(scenario(proof), files)).toEqual([]);
  });

  it('сценарий без строки «Проверено:» — нарушение на его заголовке', () => {
    const text = `${scenario(`Проверено: ${LIVE}`)}\n### 2. Второй\n\nТекст.\n`;
    expect(texts(text)).toEqual(['7: сценарий без строки «Проверено:»']);
  });

  it('строка «Проверено:» чужого сценария не засчитывается', () => {
    const text = `### 1. Первый\n\nТекст.\n\n### 2. Второй\n\nПроверено: ${LIVE}\n`;
    expect(texts(text)).toEqual(['1: сценарий без строки «Проверено:»']);
  });

  it('гайд без единой строки «Проверено:» — нарушение', () => {
    expect(texts('# Гайд\n\nПросто текст.\n')).toEqual([
      '1: в гайде нет ни одной строки «Проверено:»',
    ]);
  });

  it('заголовки без номера сценарием не считаются', () => {
    const text = `## Раздел\n\n### Без номера\n\n${scenario(`Проверено: ${LIVE}`)}`;
    expect(checkGuide(text)).toEqual([]);
  });
});

describe('GuideTaskChecker — таблица «Состояние / Проверено»', () => {
  const head = '| Задача | Состояние | Проверено |\n|---|---|---|\n';
  const live = `Проверено: ${LIVE}`;
  const table = (...rows: string[]) =>
    `${scenario(live)}\n${head}${rows.join('\n')}\n`;

  it('«есть» с живой ячейкой и «отложено» с прочерком — без нарушений', () => {
    const text = table(
      `| выбор | есть | ${live} |`,
      '| мастер | отложено | — |',
    );
    expect(checkGuide(text)).toEqual([]);
  });

  it('«есть» с прочерком — нарушение: нет строки «Проверено:»', () => {
    expect(texts(table('| выбор | есть | — |'))).toEqual([
      '9: строка таблицы без «Проверено:» при состоянии «есть»',
    ]);
  });

  it('«есть; нюанс» тоже требует проверки', () => {
    expect(texts(table('| мастер | есть; черновик отложен | — |'))).toEqual([
      '9: строка таблицы без «Проверено:» при состоянии «есть»',
    ]);
  });

  it('мёртвая ссылка в ячейке — нарушение с номером строки таблицы', () => {
    const dead = 'Проверено: [x](../../acceptance/none.test.ts) — «сценарий 1»';
    expect(texts(table(`| выбор | есть | ${dead} |`))).toEqual([
      '9: ../../acceptance/none.test.ts: файл не найден',
    ]);
  });

  it('фрагмент в ячейке ищется так же, как в строке сценария', () => {
    const miss =
      'Проверено: [a.test.ts](../../acceptance/a.test.ts) — «сценарий 7»';
    expect(texts(table(`| выбор | есть | ${miss} |`))).toEqual([
      '9: ../../acceptance/a.test.ts: фрагмент «сценарий 7» не найден',
    ]);
  });

  it('таблица без столбца «Проверено» не проверяется', () => {
    const text = `${scenario(live)}\n| Задача | Состояние |\n|---|---|\n| выбор | есть |\n`;
    expect(checkGuide(text)).toEqual([]);
  });
});

describe('GuideTaskChecker — блоки кода «// из:»', () => {
  const proved = `Проверено: ${LIVE}`;
  const block = (...lines: string[]) =>
    `${scenario(proved)}\n\`\`\`ts\n${lines.join('\n')}\n\`\`\`\n`;

  it('строки образца по порядку, с пропусками и отступами — без нарушений', () => {
    const text = block(
      '// из: src/screen.ts',
      'export const Screen = {',
      'actions: {',
      '  close: { label: "Закрыть" },',
      '};',
    );
    expect(checkGuide(text)).toEqual([]);
  });

  it('пустые строки внутри блока не считаются', () => {
    const text = block(
      '// из: src/screen.ts',
      'export const Screen = {',
      '',
      '};',
    );
    expect(checkGuide(text)).toEqual([]);
  });

  it('строки не в том порядке — нарушение на первой не найденной', () => {
    const text = block(
      '// из: src/screen.ts',
      'close: { label: "Закрыть" },',
      'open: { label: "Открыть" },',
    );
    expect(texts(text)).toEqual([
      '10: src/screen.ts: строка не найдена по порядку: open: { label: "Открыть" },',
    ]);
  });

  it('сочинённая строка — нарушение', () => {
    const text = block(
      '// из: src/screen.ts',
      'label: "Список",',
      'hint: "х",',
    );
    expect(texts(text)).toEqual([
      '10: src/screen.ts: строка не найдена по порядку: hint: "х",',
    ]);
  });

  it('файла образца нет — нарушение', () => {
    const text = block('// из: src/none.ts', 'const x = 1;');
    expect(texts(text)).toEqual(['8: src/none.ts: файл не найден']);
  });

  it('блок без первой строки «// из:» — нарушение', () => {
    const text = block('export const Screen = {', '};');
    expect(texts(text)).toEqual([
      '8: блок кода без первой строки «// из: путь»',
    ]);
  });

  it('путь образца за пределами репо — нарушение', () => {
    const text = block('// из: ../outside.ts', 'const x = 1;');
    expect(texts(text)).toEqual(['8: ../outside.ts: путь вне репо']);
  });

  it('блок, не закрытый до конца файла, — нарушение на строке открытия', () => {
    const text = `${scenario(proved)}\n\`\`\`ts\n// из: src/screen.ts\nexport const Screen = {\n`;
    expect(texts(text)).toEqual(['7: блок кода не закрыт']);
  });

  it('только «// из:» без строк образца — нарушение', () => {
    const text = block('// из: src/screen.ts');
    expect(texts(text)).toEqual([
      '8: src/screen.ts: в блоке нет строк образца',
    ]);
  });
});

describe('гайд репо', () => {
  const guide = TextTree.file(ROOT, GUIDE);

  it('гайд «Задачи фронта» существует', () => {
    expect(guide).toBeDefined();
  });

  it('все «Проверено:» живы, блоки «// из:» совпадают с образцом', () => {
    if (!guide) throw new Error(`${GUIDE}: нет файла`);
    const found = new GuideTaskChecker(ROOT).check(guide);
    expect(found.map((v) => `${v.file}:${v.line} ${v.text}`)).toEqual([]);
  });
});
