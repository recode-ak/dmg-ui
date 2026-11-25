import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { DomSinkScanner } from './dom-sink-scanner';
import { SourceFile, SourceTree } from './source-tree';
import type { Violation } from './violation.types';

// Строки людей (названия задач, замечания, заметки, тексты уведомлений)
// попадают в DOM только текстом. Приёмники разбора разметки и исполнения
// строки в канале web учебного проекта (раннер `web` и фронт) и клиенте
// страничного пакета запрещены:
// без них текст людей не может стать разметкой или кодом. Тесты не
// проверяются; член чужого объекта и часть имени — не нарушение.

const ROOT = resolve(import.meta.dir, '..');
const WEB = 'packages/example/src/runners/web';
const EXAMPLE = `${WEB}/client/x.ts`;
const PAGE_CLIENT = 'packages/web-ui/src/client/x.ts';

const scan = (text: string, path: string): Violation[] =>
  new DomSinkScanner().scan([SourceFile.of(path, text)]);

describe('DomSinkScanner — приёмники разметки и исполнения строки', () => {
  const sinks: [string, string][] = [
    ['el.innerHTML = value;', 'innerHTML'],
    ['const html = el.innerHTML;', 'innerHTML'],
    ['el.outerHTML = value;', 'outerHTML'],
    ["el.insertAdjacentHTML('beforeend', value);", 'insertAdjacentHTML'],
    ['document.write(value);', 'document.write'],
    [
      'const f = range.createContextualFragment(value);',
      'createContextualFragment',
    ],
    ["const d = new DOMParser().parseFromString(v, 'text/html');", 'DOMParser'],
    ['frame.srcdoc = value;', 'srcdoc'],
    ['eval(value);', 'eval('],
    ["const f = new Function('a', value);", 'new Function'],
    ["const href = 'javascript:alert(1)';", 'javascript:'],
  ];

  for (const [line, name] of sinks) {
    for (const path of [EXAMPLE, PAGE_CLIENT]) {
      it(`«${line}» в ${path} — нарушение «${name}» с файлом и строкой`, () => {
        const found = scan(`const a = 1;\n${line}\n`, path);

        expect(found).toHaveLength(1);
        expect(found[0]).toMatchObject({ file: path, line: 2 });
        expect(found[0]?.text).toContain(name);
      });
    }
  }

  it('несколько приёмников в строке — по нарушению на каждый', () => {
    expect(
      scan('a.innerHTML = b; c.outerHTML = d;', EXAMPLE).map((v) => v.text),
    ).toEqual(['innerHTML', 'outerHTML']);
  });
});

describe('DomSinkScanner — зона проверки', () => {
  const line = 'el.innerHTML = value;';

  for (const dir of ['client', 'view', 'server', 'common', 'testing']) {
    it(`раннер web: ${dir}/ проверяется целиком`, () => {
      expect(scan(line, `${WEB}/${dir}/x.ts`)).toHaveLength(1);
    });
  }

  it('оболочка в корне раннера web проверяется', () => {
    expect(scan(line, `${WEB}/example-web-views.ts`)).toHaveLength(1);
  });

  for (const path of [
    'packages/example/src/frontend/todo/web/shared/task-list.view.ts',
    'packages/example/src/frontend/web-kit/example-screen-view.ts',
  ]) {
    it(`фронт учебного проекта ${path} проверяется`, () => {
      expect(scan(line, path)).toHaveLength(1);
    });
  }

  it('вложенный каталог клиента страничного пакета проверяется', () => {
    expect(scan(line, 'packages/web-ui/src/client/deep/x.ts')).toHaveLength(1);
  });

  for (const path of [
    'packages/web-ui/src/server/x.ts',
    'packages/web-ui/src/view/x.ts',
    'packages/core/src/x.ts',
    'packages/chat-ui/src/x.ts',
    'packages/example/src/runners/tg-bot/x.ts',
    'packages/example/src/platform/ui/x.ts',
    'checks/x.ts',
    'acceptance/x.ts',
  ]) {
    it(`${path} вне зоны`, () => {
      expect(scan(line, path)).toEqual([]);
    });
  }

  for (const path of [
    `${WEB}/client/x.test.ts`,
    `${WEB}/view/x.test.ts`,
    'packages/web-ui/src/client/x.test.ts',
  ]) {
    it(`тест ${path} не проверяется`, () => {
      expect(
        scan(`${line}\neval(x);\nconst h = 'javascript:x';`, path),
      ).toEqual([]);
    });
  }
});

describe('DomSinkScanner — не приёмники', () => {
  for (const clean of [
    'const t = row.innerHTMLText;',
    'const innerHTMLCount = 1;',
    'const outerHTMLs = [];',
    'const r = evaluate(value);',
    'const retrieval = 1;',
    'const f = new FunctionBox();',
    'const isFunction = typeof x === "function";',
    'const w = writer.write(value);',
    'const p = new DOMParserLike();',
    'el.textContent = value;',
    "el.setAttribute('class', 'row');",
    "const d = document.createElement('div');",
    'const s = srcdocument;',
  ]) {
    it(`«${clean}» не срабатывает`, () => {
      expect(scan(clean, EXAMPLE)).toEqual([]);
    });
  }
});

describe('DomSinkScanner — реальный репо', () => {
  it('на packages — ноль нарушений', () => {
    expect(
      new DomSinkScanner().scan(SourceTree.read(ROOT, 'packages')),
    ).toEqual([]);
  });

  for (const dir of [
    'packages/web-ui/src/client',
    `${WEB}/client`,
    'packages/example/src/frontend/web-kit',
  ]) {
    it(`${dir}/ не пуст: проверка не вхолостую`, () => {
      expect(SourceTree.read(ROOT, dir).length).toBeGreaterThan(0);
    });
  }
});
