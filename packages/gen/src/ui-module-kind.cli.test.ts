import { beforeAll, describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DmgCoreCli, PackageSource } from 'dmg-core/cli';
import { useTempDir } from 'dmg-core/testing';

// Сквозной проход через `dmg-core gen`: ядро находит вход `dmg-ui/dmg-core`
// у проекта-потребителя и запускает вид. `node_modules` проекта собирается до
// первого вызова CLI: промах `Bun.resolveSync` кэшируется на процесс, поэтому
// у каждого теста свой каталог.

const REPO = resolve(import.meta.dir, '../../..');

const LAYERS = {
  ui: { dir: 'platform/ui/src', package: '@acme/ui' },
  'fe-app': { dir: 'frontend/app/src' },
  'fe-logic': { dir: 'frontend/{m}/logic/src', package: '@acme/fe-{m}' },
  'fe-chat': { dir: 'frontend/{m}/chat/src', package: '@acme/fe-{m}-chat' },
  'fe-telegram': {
    dir: 'frontend/{m}/telegram/src',
    package: '@acme/fe-{m}-telegram',
  },
  'fe-web': { dir: 'frontend/{m}/web/src', package: '@acme/fe-{m}-web' },
  'chat-kit': { dir: 'frontend/chat-kit/src' },
};

const tmp = useTempDir('dmg-ui-gen-cli-');

let cli: DmgCoreCli;

beforeAll(async () => {
  cli = new DmgCoreCli(
    await PackageSource.load(join(REPO, 'node_modules/dmg-core')),
  );
});

const put = async (root: string, path: string, text: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
};

/** Проект-потребитель: конфиг, корневой манифест, раннер и `dmg-ui` в `node_modules` */
const project = async (): Promise<string> => {
  const root = tmp().path;
  await mkdir(join(root, 'node_modules'), { recursive: true });
  await symlink(REPO, join(root, 'node_modules/dmg-ui'));
  await put(
    root,
    '.dmg/config.json',
    JSON.stringify({ providers: ['dmg-ui'], layers: LAYERS }),
  );
  await put(
    root,
    'package.json',
    JSON.stringify({
      name: 'acme',
      workspaces: ['platform/*', 'frontend/*/*', 'runners/*'],
      dependencies: {
        'dmg-ui': 'git+ssh://git@example.com/acme/dmg-ui.git#v0.6.0',
      },
    }),
  );
  await put(
    root,
    'runners/bot/package.json',
    JSON.stringify({ name: '@acme/bot', private: true }),
  );
  return root;
};

/** Файлы проекта без `node_modules`: путь → текст */
const snapshot = async (root: string): Promise<Map<string, string>> => {
  const files = new Map<string, string>();
  for await (const path of new Bun.Glob('**/*').scan({
    cwd: root,
    dot: true,
  })) {
    if (path.startsWith('node_modules/')) continue;
    files.set(path, await Bun.file(join(root, path)).text());
  }
  return files;
};

describe('dmg-core gen ui-module — через вход dmg-ui/dmg-core', () => {
  it('dry-run: вход резолвится, вид найден, список файлов напечатан, ничего не записано', async () => {
    const root = await project();
    const before = await snapshot(root);

    const result = await cli.gen(root, ['ui-module', 'courses', 'runners/bot']);

    expect(result.ok).toBe(true);
    expect(result.messages[0]).toStartWith('Вид «ui-module» — dmg-ui, слои:');
    expect(
      result.messages.filter((line) => line.startsWith('Будет создан: ')),
    ).toHaveLength(13);
    expect(await snapshot(root)).toEqual(before);
  });

  it('--write: файлы созданы, в package.json раннера — три зависимости workspace:*', async () => {
    const root = await project();

    const result = await cli.gen(root, [
      'ui-module',
      'courses',
      'runners/bot',
      '--write',
    ]);

    expect(result.ok).toBe(true);
    const created = result.messages
      .filter((line) => line.startsWith('Создан: '))
      .map((line) => line.slice('Создан: '.length));
    expect(created).toHaveLength(13);
    for (const path of created) expect(existsSync(path)).toBe(true);
    expect(
      JSON.parse(readFileSync(join(root, 'runners/bot/package.json'), 'utf8'))
        .dependencies,
    ).toEqual({
      '@acme/fe-courses': 'workspace:*',
      '@acme/fe-courses-chat': 'workspace:*',
      '@acme/fe-courses-web': 'workspace:*',
    });
  });

  it('без модуля: отказ с текстом вида — ядро узнаёт GenError по имени', async () => {
    const root = await project();

    const result = await cli.gen(root, ['ui-module']);

    expect(result).toEqual({
      ok: false,
      messages: [
        'Ошибка: Для «ui-module» нужен модуль — ui-module <модуль> [<раннер>…]',
      ],
    });
  });
});
