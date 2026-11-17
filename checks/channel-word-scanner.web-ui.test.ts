import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { ChannelWordScanner } from './channel-word-scanner';
import { SourceFile, SourceTree } from './source-tree';

// Словарь `web-ui`: названия фреймворков и мессенджеров. Контракт подписки
// пакета нейтрален к фреймворку — привязка живёт в отдельном пакете;
// мессенджеров страничный пакет не знает. Общие слова канала (страница,
// адрес, окно) и слова контракта (реактивность, хранилище) разрешены.

const ROOT = resolve(import.meta.dir, '..');
const SRC = 'packages/web-ui/src';

const scan = (text: string, path = `${SRC}/view/a.ts`) =>
  ChannelWordScanner.webUi().scan([SourceFile.of(path, text)]);

describe('ChannelWordScanner.webUi — в web-ui нет названий фреймворков и мессенджеров', () => {
  const forbidden = [
    'svelte',
    'sveltekit',
    'sveltejs',
    'react',
    'reactjs',
    'preact',
    'vue',
    'vuejs',
    'nuxt',
    'nextjs',
    'solidjs',
    'angular',
    'lit',
    'jsx',
    'htmx',
    'alpine',
    'jquery',
    'qwik',
    'telegram',
    'tg',
    'whatsapp',
    'slack',
    'discord',
    'viber',
    'телеграм',
    'телеграмме',
    'ватсап',
    'вотсап',
    'слак',
    'дискорд',
    'вайбер',
  ];

  for (const word of forbidden) {
    it(`слово «${word}» даёт нарушение с файлом и строкой`, () => {
      const found = scan(`export const a = 1;\n// ${word} тут\n`);
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({ file: `${SRC}/view/a.ts`, line: 2 });
      expect(found[0]?.text).toContain(word);
    });
  }

  it('пакет из npm-области находится: @sveltejs/kit — sveltejs', () => {
    expect(scan("import { a } from '@sveltejs/kit';")).toHaveLength(1);
  });

  it('регистр не важен', () => {
    expect(scan('const a = "SVELTE";')).toHaveLength(1);
  });

  it('слово внутри camelCase находится: useReactLike — react', () => {
    expect(scan('const useReactLike = 1;')).toHaveLength(1);
  });

  it('слово в тестовом файле и в testing/ пакета срабатывает', () => {
    expect(scan('// vue', `${SRC}/client/a.test.ts`)).toHaveLength(1);
    expect(scan('// vue', 'packages/web-ui/testing/a.ts')).toHaveLength(1);
  });

  for (const allowed of [
    'page',
    'pages',
    'url',
    'страница',
    'страницы',
    'window',
    'реактивность',
    'reactive',
    'store',
    'solid',
    'subscribe',
    'source',
  ]) {
    it(`разрешённое слово «${allowed}» не срабатывает`, () => {
      expect(scan(`// ${allowed}`)).toEqual([]);
    });
  }

  it('на реальном packages/web-ui (весь каталог) — ноль нарушений', () => {
    const files = SourceTree.read(ROOT, 'packages/web-ui');
    expect(files.length).toBeGreaterThan(0);
    expect(ChannelWordScanner.webUi().scan(files)).toEqual([]);
  });
});
