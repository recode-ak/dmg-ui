import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DmgCoreCli, PackageSource } from 'dmg-core/cli';
import { useTempDir } from 'dmg-core/testing';
import { UiFileNames } from 'dmg-ui/testing';

// Применённый план: временный проект собирается шагами `gen … --write`
// через `dmg-core gen` (ядро применяет планы видов), как у потребителя:
// сначала модуль, затем сторис, экраны и уведомление. Проверяются итоговые
// файлы — без дублей и подсказок, имена по `naming.md`, форма biome.

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

const UI_INDEX = 'platform/ui/src/index.ts';
const UI_MODULE = 'platform/ui/src/courses/courses.ui-module.ts';
const CODES = 'frontend/courses/logic/src/courses-codes.ts';
const STORY = 'platform/ui/src/courses/browse/browse.story.ts';
const CHAT_VIEWS = 'frontend/courses/chat/src/courses-chat.views.ts';
const WEB_VIEWS = 'frontend/courses/web/src/courses-web.views.ts';

const COURSES_STEPS = [
  ['ui-module', 'courses'],
  ['story', 'courses', 'browse', 'course-list'],
  ['screen', 'courses', 'browse', 'course-card'],
  ['screen', 'courses', 'shared', 'course-badge'],
  ['notification', 'courses', 'shared', 'course-opened'],
];

// Длинные имена — перенос строк в шаблонах всех видов.
const LONG = 'schools-and-courses-in-any-city-launching';
const LONG_STEPS = [
  ['ui-module', LONG],
  [
    'story',
    LONG,
    'browse-all-courses-in-the-city',
    'course-details-overview-with-schedule',
  ],
  [
    'screen',
    LONG,
    'browse-all-courses-in-the-city',
    'course-schedule-for-the-whole-week',
  ],
  ['screen', LONG, 'shared', 'course-badge-with-long-caption'],
  ['notification', LONG, 'shared', 'course-opened-for-everyone-in-the-city'],
];

const tmp = useTempDir('dmg-ui-gen-applied-');

const put = async (root: string, path: string, text: string) => {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
};

/**
 * Проект-потребитель и его сборка шагами `--write`. Возвращает корень и
 * строки «Вставь вручную» всех шагов; отказ шага — исключение с его текстом.
 */
const build = async (steps: string[][]) => {
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
      workspaces: ['platform/*', 'frontend/*/*'],
      dependencies: {
        'dmg-ui': 'git+ssh://git@example.com/acme/dmg-ui.git#v0.6.0',
      },
    }),
  );
  await put(root, UI_INDEX, '// Описание проекта.\n\n// gen:exports\n');
  const cli = new DmgCoreCli(
    await PackageSource.load(join(REPO, 'node_modules/dmg-core')),
  );
  const hints: string[] = [];
  for (const step of steps) {
    const result = await cli.gen(root, [...step, '--write']);
    if (!result.ok) {
      throw new Error(`${step.join(' ')}: ${result.messages.join('\n')}`);
    }
    hints.push(
      ...result.messages.filter((line) => line.startsWith('Вставь вручную')),
    );
  }
  return { root, hints };
};

const read = (root: string, path: string) =>
  readFileSync(join(root, path), 'utf8');

/** Файлы `.ts` проекта (без `node_modules`): путь от корня */
const sourcesOf = (root: string): string[] =>
  [
    ...new Bun.Glob('{platform,frontend}/**/*.ts').scanSync({ cwd: root }),
  ].sort();

/** Имена `…Def` внутри списка `<list>: [ … ]` манифеста */
const listed = (text: string, list: string): string[] => {
  const body = new RegExp(`${list}: \\[([^\\]]*)\\]`).exec(text)?.[1] ?? '';
  return [...body.matchAll(/\b\w+Def\b/g)].map((match) => match[0]);
};

/** Сколько строк импорта или реэкспорта берут имя из источника */
const importsFrom = (text: string, source: string): string[] =>
  text.split('\n').filter((line) => line.includes(`from '${source}'`));

/** Имена одного импорта `import { a, b } from '<источник>'`, в том числе в несколько строк */
const namesFrom = (text: string, source: string): string[] => {
  const match = new RegExp(`import \\{([^}]*)\\} from '${source}';`).exec(text);
  return (match?.[1] ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .sort();
};

describe('ui-module, story, screen, notification — применённый план', () => {
  it('подсказок нет; реестры и списки без дублей, слияние импортов в один', async () => {
    const { root, hints } = await build(COURSES_STEPS);

    expect(hints).toEqual([]);

    const codes = read(root, CODES);
    expect(importsFrom(codes, 'dmg-ui')).toEqual([
      "import { CodeLoader, CodeLoaders } from 'dmg-ui';",
    ]);
    expect(importsFrom(codes, '@acme/ui')).toHaveLength(1);
    expect(namesFrom(codes, '@acme/ui')).toEqual([
      'CourseBadgeScreenDef',
      'CourseCardScreenDef',
      'CourseListScreenDef',
      'CourseOpenedNotificationDef',
      'CoursesUiModuleDef',
    ]);
    expect(codes.match(/CodeLoader\.screen\(/g)).toHaveLength(3);
    expect(codes.match(/CodeLoader\.notification\(/g)).toHaveLength(1);

    const story = read(root, STORY);
    expect(listed(story, 'screens')).toEqual([
      'CourseListScreenDef',
      'CourseCardScreenDef',
    ]);
    expect(importsFrom(story, './course-list.screen')).toHaveLength(1);
    expect(importsFrom(story, './course-card.screen')).toHaveLength(1);
    expect(story).not.toContain('CourseBadgeScreenDef');

    const module = read(root, UI_MODULE);
    expect(listed(module, 'screens')).toEqual([
      'CourseListScreenDef',
      'CourseCardScreenDef',
      'CourseBadgeScreenDef',
    ]);
    expect(listed(module, 'stories')).toEqual(['BrowseStoryDef']);
    expect(listed(module, 'notifications')).toEqual([
      'CourseOpenedNotificationDef',
    ]);
    for (const spec of [
      './browse/course-list.screen',
      './browse/course-card.screen',
      './shared/course-badge.screen',
      './browse/browse.story',
      './shared/course-opened.notification',
    ]) {
      expect(importsFrom(module, spec)).toHaveLength(1);
    }

    for (const path of [CHAT_VIEWS, WEB_VIEWS]) {
      const views = read(root, path);
      expect(
        [...views.matchAll(/^ {2}(\w+View),$/gm)].map((match) => match[1]),
      ).toEqual([
        'CourseListView',
        'CourseCardView',
        'CourseBadgeView',
        'CourseOpenedView',
      ]);
    }

    const exports = read(root, UI_INDEX)
      .split('\n')
      .filter((line) => line.startsWith('export '));
    expect([...exports].sort()).toEqual(
      [
        "export { BrowseStoryDef } from './courses/browse/browse.story';",
        "export { CourseBadgeScreenDef } from './courses/shared/course-badge.screen';",
        "export { CourseCardScreenDef } from './courses/browse/course-card.screen';",
        "export { CourseListScreenDef } from './courses/browse/course-list.screen';",
        "export { CourseOpenedNotificationDef } from './courses/shared/course-opened.notification';",
        "export { CoursesUiModuleDef } from './courses/courses.ui-module';",
      ].sort(),
    );
  }, 30_000);

  it('имена и раскладка файлов UI по naming.md: нарушений нет (NM-01)', async () => {
    const { root } = await build([...COURSES_STEPS, ...LONG_STEPS]);

    const found = new UiFileNames({
      ui: 'platform/ui/src',
      logic: 'frontend/{m}/logic/src',
      channels: ['frontend/{m}/chat/src', 'frontend/{m}/web/src'],
    }).check(sourcesOf(root).map((path) => ({ path, text: read(root, path) })));

    expect(found).toEqual([]);
  }, 30_000);

  it('каждый .ts проекта — неподвижная точка biome check с конфигом репо', async () => {
    const { root } = await build([...COURSES_STEPS, ...LONG_STEPS]);

    // Файлы проекта лежат во временном каталоге, конфиг — репо: `check` по
    // stdin линтер не запускает, а на файлах показывает форму, импорты и lint.
    const files = sourcesOf(root);
    const biome = Bun.spawn(
      [
        join(REPO, 'node_modules/.bin/biome'),
        'check',
        `--config-path=${REPO}`,
        ...files,
      ],
      { cwd: root, stdout: 'pipe', stderr: 'pipe' },
    );
    const [out, err, code] = await Promise.all([
      new Response(biome.stdout).text(),
      new Response(biome.stderr).text(),
      biome.exited,
    ]);

    expect(files.length).toBeGreaterThan(30);
    expect({ code, report: code === 0 ? '' : `${out}\n${err}` }).toEqual({
      code: 0,
      report: '',
    });
  }, 30_000);
});
