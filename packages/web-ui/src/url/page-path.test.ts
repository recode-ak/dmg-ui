import { describe, expect, test } from 'bun:test';
import { PagePath } from './page-path';

// Небросающий вход шаблона пути (D-UI-77): `read` отдаёт `Result` с причиной
// текстом, `common` — общий путь экрана или причину; `parse` — тонкая обёртка,
// которая бросает ту же причину с префиксом `PageUrls: `. Здесь — только
// сам `read`; бросок сборки целиком проверяет `page-urls.test.ts`.

const FORM = 'не по форме: [a-z0-9-]+ или :имя';

describe('PagePath.read — шаблон разобран', () => {
  const rows: [string, readonly string[]][] = [
    ['/', []],
    ['/assigned', []],
    ['/task/:taskId', ['taskId']],
    ['/page/:page', ['page']],
    ['/c/:a/x-1/:b', ['a', 'b']],
  ];

  test.each(rows)('%s — ok, имена параметров по порядку', (path, names) => {
    const result = PagePath.read(path);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.path).toBe(path);
    expect(result.value.names()).toEqual(names);
  });
});

describe('PagePath.read — отказ с причиной текстом, без броска', () => {
  const rows: [string, string][] = [
    ['tasks', 'шаблон пути «tasks» не начинается с /'],
    ['', 'шаблон пути «» не начинается с /'],
    ['/Bad', `сегмент «Bad» шаблона пути «/Bad» ${FORM}`],
    ['/ta sks', `сегмент «ta sks» шаблона пути «/ta sks» ${FORM}`],
    ['/a//b', `сегмент «» шаблона пути «/a//b» ${FORM}`],
    ['/a/', `сегмент «» шаблона пути «/a/» ${FORM}`],
    ['//', `сегмент «» шаблона пути «//» ${FORM}`],
    ['/p/:1x', `сегмент «:1x» шаблона пути «/p/:1x» ${FORM}`],
    ['/p/:', `сегмент «:» шаблона пути «/p/:» ${FORM}`],
    [
      '/p/:page/:page',
      'параметр page повторён в шаблоне пути «/p/:page/:page»',
    ],
    // Причина одна — первая по порядку сегментов.
    ['/Bad/:x/:x', `сегмент «Bad» шаблона пути «/Bad/:x/:x» ${FORM}`],
  ];

  test.each(rows)('%p — %s', (path, reason) => {
    expect(() => PagePath.read(path)).not.toThrow();
    expect(PagePath.read(path)).toEqual({ ok: false, error: reason });
  });
});

describe('PagePath.parse — обёртка над read', () => {
  const messageOf = (run: () => unknown): string | undefined => {
    try {
      run();
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    return undefined;
  };

  test('отказ read — бросок той же причины с префиксом PageUrls', () => {
    const reason = PagePath.read('/p/:page/:page');

    expect(reason.ok).toBe(false);
    expect(messageOf(() => PagePath.parse('/p/:page/:page'))).toBe(
      `PageUrls: ${reason.ok ? '' : reason.error}`,
    );
  });

  test('успех read — тот же шаблон, без броска', () => {
    expect(PagePath.parse('/task/:taskId').names()).toEqual(['taskId']);
  });
});

describe('PagePath.common — общий путь экрана', () => {
  test('модуль и экран — /<модуль>/<экран>', () => {
    expect(
      PagePath.common('exampleUi/todo/taskCard', 'todo', 'taskCard'),
    ).toEqual({ ok: true, value: '/todo/taskCard' });
  });

  /** Название, id экрана, модуль, экран, имя в причине. */
  const rows: [string, string, string, string, string][] = [
    [
      'дефис в имени модуля',
      'soloUi/my-module/odd',
      'my-module',
      'odd',
      'my-module',
    ],
    ['подчёркивание в имени экрана', 'soloUi/solo/_x', 'solo', '_x', '_x'],
    ['имя с цифры', 'soloUi/1x/odd', '1x', 'odd', '1x'],
    ['пустое имя экрана', 'soloUi/solo/', 'solo', '', ''],
  ];

  test.each(rows)(
    '%s — отказ с именем и id экрана',
    (_name, id, module, screen, bad) => {
      expect(PagePath.common(id, module, screen)).toEqual({
        ok: false,
        error: `имя ${bad} не годится для общего пути экрана ${id}: буква, затем буквы и цифры`,
      });
    },
  );

  test('оба имени плохие — причина называет модуль, он проверяется первым', () => {
    expect(PagePath.common('soloUi/my-module/_x', 'my-module', '_x')).toEqual({
      ok: false,
      error:
        'имя my-module не годится для общего пути экрана soloUi/my-module/_x: буква, затем буквы и цифры',
    });
  });
});
