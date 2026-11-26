import { describe, expect, it } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  GenError,
  GenLayout,
  type GenPlan,
  type LayerPlace,
  ProjectConfig,
} from 'dmg-core/gen';
import { useTempDir } from 'dmg-core/testing';
import { UiFileNames } from 'dmg-ui/testing';
import { UiModuleKind } from './ui-module-kind';

// План вида `ui-module`: раскладка в `layers`, пакеты единиц, правка набора
// `index.ts`, зависимости раннера, заметки и отказы. Корень проекта —
// временный каталог с `package.json`, слои — как у потребителя с пакетами.

const DMG_UI = 'git+ssh://git@example.com/acme/dmg-ui.git#v0.6.0';
const WORKSPACES = ['platform/*', 'frontend/*/*', 'runners/*'];
const ROOT_MANIFEST = {
  workspaces: WORKSPACES,
  dependencies: { 'dmg-ui': DMG_UI },
};

const LAYERS: Record<string, LayerPlace> = {
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

// Спецификаторы входов в константах: строка теста `from '…'` читалась бы
// проверкой направлений как импорт файла теста.
const CHAT_UI = 'dmg-ui/chat-ui';
const WEB_UI = 'dmg-ui/web-ui';

const COURSES_FILES = [
  'frontend/courses/chat/package.json',
  'frontend/courses/chat/src/courses-chat.views.ts',
  'frontend/courses/chat/src/index.ts',
  'frontend/courses/chat/tsconfig.json',
  'frontend/courses/logic/package.json',
  'frontend/courses/logic/src/courses-codes.ts',
  'frontend/courses/logic/src/index.ts',
  'frontend/courses/logic/tsconfig.json',
  'frontend/courses/web/package.json',
  'frontend/courses/web/src/courses-web.views.ts',
  'frontend/courses/web/src/index.ts',
  'frontend/courses/web/tsconfig.json',
  'platform/ui/src/courses/courses.ui-module.ts',
];

type Setup = {
  layers?: Record<string, LayerPlace>;
  /** `undefined` — у корня нет package.json; любое значение пишется как JSON */
  manifest?: unknown;
  /** Текст package.json как есть — для невалидного JSON */
  rawManifest?: string;
};

const without = (...names: string[]): Record<string, LayerPlace> =>
  Object.fromEntries(
    Object.entries(LAYERS).filter(([name]) => !names.includes(name)),
  );

const withoutPackages = (): Record<string, LayerPlace> =>
  Object.fromEntries(
    Object.entries(LAYERS).map(([name, place]) => [name, { dir: place.dir }]),
  );

const tmp = useTempDir('dmg-ui-gen-ui-module-');

const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (GenError.is(error)) return error.message;
    throw error;
  }
  return 'отказа нет';
};

/** Корень проекта во временном каталоге и план вида по аргументам */
const planIn = (args: string[], setup: Setup = {}) => {
  const root = tmp().path;
  const manifest = 'manifest' in setup ? setup.manifest : ROOT_MANIFEST;
  if (setup.rawManifest !== undefined) {
    writeFileSync(join(root, 'package.json'), setup.rawManifest);
  } else if (manifest !== undefined) {
    writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
  }
  const layout = GenLayout.from(
    ProjectConfig.parse({ layers: setup.layers ?? LAYERS }),
    root,
  );
  const plan = () => new UiModuleKind().plan(args, { layout });
  return { root, plan };
};

const planned = (args: string[], setup?: Setup) => {
  const { root, plan } = planIn(args, setup);
  return { root, plan: plan() };
};

const paths = (root: string, plan: GenPlan) =>
  plan.files.map((file) => relative(root, file.path)).sort();

const textOf = (root: string, plan: GenPlan, path: string): string => {
  const file = plan.files.find((f) => relative(root, f.path) === path);
  if (file === undefined) throw new Error(`в плане нет файла ${path}`);
  return file.content;
};

const COURSES_NOTES = [
  'Подключи CoursesUiModuleDef в modules набора UI (platform/ui/src/<набор>.set.ts).',
  'Подключи реестры coursesCodes, coursesChatViews, coursesWebViews к сборкам оболочки (AppCodeLoaders, AppChatViews, AppPageViews).',
  'Канал «telegram»: реестр не создан — шаблоны есть для chat (ChatViews) и web (PageViews); канал на базе держит только перекрытия (courses<База>Views.over).',
  'Затем bun install — чтобы пакеты единиц появились в node_modules.',
];

describe('UiModuleKind — план «courses runners/bot»', () => {
  it('файлы: описание модуля, код, пакеты и tsconfig логики, chat и web; telegram без файлов', () => {
    const { root, plan } = planned(['courses', 'runners/bot']);

    expect(paths(root, plan)).toEqual(COURSES_FILES);
  });

  it('правка набора описания: строка экспорта по маркеру // gen:exports', () => {
    const { root, plan } = planned(['courses', 'runners/bot']);

    expect(plan.edits).toEqual([
      {
        path: join(root, 'platform/ui/src/index.ts'),
        marker: '// gen:exports',
        line: "export { CoursesUiModuleDef } from './courses/courses.ui-module';",
      },
    ]);
  });

  it('зависимости: три пакета единиц в package.json раннера, workspace:*', () => {
    const { root, plan } = planned(['courses', 'runners/bot']);

    const dependencies = [...(plan.dependencies ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    expect(dependencies).toEqual(
      ['@acme/fe-courses', '@acme/fe-courses-chat', '@acme/fe-courses-web'].map(
        (name) => ({
          path: join(root, 'runners/bot/package.json'),
          name,
          version: 'workspace:*',
        }),
      ),
    );
  });

  it('заметки: подключить в набор и сборки, канал без шаблона, bun install', () => {
    const { plan } = planned(['courses', 'runners/bot']);

    expect(plan.notes).toEqual(COURSES_NOTES);
  });

  it('package.json единицы logic: имя, вход, тесты, зависимости на описание и dmg-ui корня', () => {
    const { root, plan } = planned(['courses', 'runners/bot']);

    const text = textOf(root, plan, 'frontend/courses/logic/package.json');
    const manifest = {
      name: '@acme/fe-courses',
      private: true,
      type: 'module',
      exports: { '.': './src/index.ts' },
      scripts: { test: 'bun test --pass-with-no-tests' },
      dependencies: { '@acme/ui': 'workspace:*', 'dmg-ui': DMG_UI },
    };
    expect(JSON.parse(text)).toEqual(manifest);
    expect(text).toBe(`${JSON.stringify(manifest, null, 2)}\n`);
  });

  it('package.json канала chat — свои имя и те же зависимости', () => {
    const { root, plan } = planned(['courses', 'runners/bot']);

    const manifest = JSON.parse(
      textOf(root, plan, 'frontend/courses/chat/package.json'),
    );
    expect(manifest.name).toBe('@acme/fe-courses-chat');
    expect(manifest.dependencies).toEqual({
      '@acme/ui': 'workspace:*',
      'dmg-ui': DMG_UI,
    });
  });

  it('tsconfig.json единицы: extends корневого и include src', () => {
    const { root, plan } = planned(['courses', 'runners/bot']);

    expect(textOf(root, plan, 'frontend/courses/logic/tsconfig.json')).toBe(
      '{\n  "extends": "../../../tsconfig.json",\n  "include": ["src"]\n}\n',
    );
  });

  it('версия dmg-ui из devDependencies корня, если в dependencies её нет', () => {
    const { root, plan } = planned(['courses', 'runners/bot'], {
      manifest: {
        workspaces: WORKSPACES,
        devDependencies: { 'dmg-ui': DMG_UI },
      },
    });

    const manifest = JSON.parse(
      textOf(root, plan, 'frontend/courses/logic/package.json'),
    );
    expect(manifest.dependencies['dmg-ui']).toBe(DMG_UI);
  });

  it('версия dmg-ui из dependencies корня важнее devDependencies', () => {
    const { root, plan } = planned(['courses', 'runners/bot'], {
      manifest: {
        workspaces: WORKSPACES,
        dependencies: { 'dmg-ui': DMG_UI },
        devDependencies: {
          'dmg-ui': 'git+ssh://git@example.com/acme/other.git',
        },
      },
    });

    const manifest = JSON.parse(
      textOf(root, plan, 'frontend/courses/logic/package.json'),
    );
    expect(manifest.dependencies['dmg-ui']).toBe(DMG_UI);
  });
});

describe('UiModuleKind — тексты файлов', () => {
  const texts = () => {
    const { root, plan } = planned(['courses']);
    return (path: string) => textOf(root, plan, path);
  };

  it('описание модуля: импорт UiModuleDef, определение и маркеры списков', () => {
    const text = texts()('platform/ui/src/courses/courses.ui-module.ts');

    expect(text).toContain("import { UiModuleDef } from 'dmg-ui';");
    expect(text).toContain(
      'export const CoursesUiModuleDef = UiModuleDef.define({',
    );
    expect(text).toContain("name: 'courses',");
    expect(text).toContain('TODO');
    for (const marker of [
      '// gen:imports',
      '// gen:screens',
      '// gen:stories',
      '// gen:notifications',
    ]) {
      expect(text).toContain(marker);
    }
  });

  it('реестр кода: CodeLoaders.of от описания из пакета @acme/ui и маркеры', () => {
    const read = texts();

    const codes = read('frontend/courses/logic/src/courses-codes.ts');
    expect(codes).toContain("import { CodeLoaders } from 'dmg-ui';");
    expect(codes).toContain("import { CoursesUiModuleDef } from '@acme/ui';");
    expect(codes).toContain('export const coursesCodes = (): CodeLoaders =>');
    expect(codes).toContain('CodeLoaders.of(CoursesUiModuleDef, [');
    expect(codes).toContain('// gen:imports');
    expect(codes).toContain('// gen:codes');
    expect(read('frontend/courses/logic/src/index.ts')).toContain(
      "export { coursesCodes } from './courses-codes';",
    );
  });

  it('канал chat: ChatViews.of из dmg-ui/chat-ui, описание из @acme/ui, маркеры', () => {
    const read = texts();

    const views = read('frontend/courses/chat/src/courses-chat.views.ts');
    expect(views).toContain(`import { ChatViews } from '${CHAT_UI}';`);
    expect(views).toContain("import { CoursesUiModuleDef } from '@acme/ui';");
    expect(views).toContain(
      'export const coursesChatViews = ChatViews.of(CoursesUiModuleDef, [',
    );
    expect(views).toContain('// gen:imports');
    expect(views).toContain('// gen:views');
    expect(read('frontend/courses/chat/src/index.ts')).toContain(
      "export { coursesChatViews } from './courses-chat.views';",
    );
  });

  it('канал web: PageViews.of из dmg-ui/web-ui, описание из @acme/ui, маркеры', () => {
    const read = texts();

    const views = read('frontend/courses/web/src/courses-web.views.ts');
    expect(views).toContain(`import { PageViews } from '${WEB_UI}';`);
    expect(views).toContain("import { CoursesUiModuleDef } from '@acme/ui';");
    expect(views).toContain(
      'export const coursesWebViews = PageViews.of(CoursesUiModuleDef, [',
    );
    expect(views).toContain('// gen:imports');
    expect(views).toContain('// gen:views');
    expect(read('frontend/courses/web/src/index.ts')).toContain(
      "export { coursesWebViews } from './courses-web.views';",
    );
  });
});

// Biome не переносит: импорт или реэкспорт одного имени, комментарии и JSON.
// Имя из ~40 букв не помещает `export const <Имя>UiModuleDef = UiModuleDef.define({`
// и реестр кода в одну строку, но помещает голову каждого после переноса.
const SINGLE_NAME = /^(export|import) \{ [^,]+ \} from '[^']+';$/;
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

describe('UiModuleKind — ширина строк', () => {
  for (const name of [
    'my-long-courses-module',
    'schools-and-courses-in-any-city-launching',
  ]) {
    it(`у всех файлов плана для модуля «${name}» строки не длиннее 80 символов`, () => {
      const { plan } = planned([name]);

      const long = plan.files
        .filter((file) => file.path.endsWith('.ts'))
        .flatMap((file) =>
          file.content
            .split('\n')
            .filter(
              (line) =>
                line.length > 80 &&
                !SINGLE_NAME.test(line) &&
                !COMMENT.test(line),
            )
            .map((line) => `${file.path}: ${line}`),
        );
      expect(long).toEqual([]);
    });
  }
});

describe('UiModuleKind — имена файлов UI (NM-01)', () => {
  it('файлы .ts плана для courses и my-courses проходят проверку имён и мест — нарушений нет', () => {
    const root = tmp().path;
    writeFileSync(join(root, 'package.json'), JSON.stringify(ROOT_MANIFEST));
    const layout = GenLayout.from(
      ProjectConfig.parse({ layers: LAYERS }),
      root,
    );
    const files = ['courses', 'my-courses'].flatMap(
      (name) => new UiModuleKind().plan([name], { layout }).files,
    );

    const found = new UiFileNames({
      ui: 'platform/ui/src',
      logic: 'frontend/{m}/logic/src',
      channels: ['frontend/{m}/chat/src', 'frontend/{m}/web/src'],
    }).check(
      files
        .filter((file) => file.path.endsWith('.ts'))
        .map((file) => ({
          path: relative(root, file.path),
          text: file.content,
        })),
    );

    expect(found).toEqual([]);
  });
});

describe('UiModuleKind — заметки о workspaces и раннере', () => {
  it('каталоги пакетов вне workspaces корня — заметка для chat и web, не для logic', () => {
    const { plan } = planned(['courses', 'runners/bot'], {
      manifest: {
        workspaces: ['frontend/*/logic'],
        dependencies: { 'dmg-ui': DMG_UI },
      },
    });

    expect(plan.notes?.filter((note) => note.startsWith('Добавь'))).toEqual([
      'Добавь «frontend/courses/chat» в workspaces package.json корня.',
      'Добавь «frontend/courses/web» в workspaces package.json корня.',
    ]);
  });

  for (const [name, workspaces] of [
    ['шаблон с ведущим «./»', ['./frontend/*/*']],
    ['форма { packages: [...] }', { packages: ['frontend/*/*'] }],
  ] as const) {
    it(`workspaces корня — ${name}: каталоги покрыты, заметки «Добавь» нет`, () => {
      const { plan } = planned(['courses', 'runners/bot'], {
        manifest: { workspaces, dependencies: { 'dmg-ui': DMG_UI } },
      });

      expect(plan.notes?.filter((note) => note.startsWith('Добавь'))).toEqual(
        [],
      );
    });
  }

  it('без раннера: заметка об объявлении пакетов в оболочке, зависимостей в плане нет', () => {
    const { plan } = planned(['courses']);

    expect(plan.dependencies ?? []).toEqual([]);
    expect(plan.notes).toEqual([
      ...COURSES_NOTES,
      'Раннер не указан: объяви @acme/fe-courses, @acme/fe-courses-chat, @acme/fe-courses-web (workspace:*) в package.json оболочки — или передай каталог: ui-module courses <раннер>.',
    ]);
  });
});

describe('UiModuleKind — отказы', () => {
  const NO_CHANNELS = without('fe-chat', 'fe-telegram', 'fe-web', 'chat-kit');

  const cases: {
    name: string;
    args: string[];
    setup?: Setup;
    message: string;
  }[] = [
    {
      name: 'нет модуля',
      args: [],
      message: 'Для «ui-module» нужен модуль — ui-module <модуль> [<раннер>…]',
    },
    {
      name: 'имя не kebab-case',
      args: ['Courses'],
      message:
        'ui-module: модуль «Courses» — имя в kebab-case (a-z, 0-9, дефисы)',
    },
    {
      name: 'в layers нет каналов',
      args: ['courses'],
      setup: { layers: NO_CHANNELS },
      message: 'ui-module: в layers нет каналов — нужен слой fe-<канал>',
    },
    {
      name: 'модуль app',
      args: ['app'],
      message:
        'ui-module: модуль «app» — каталог совпал бы со слоем fe-app, имя зарезервировано',
    },
    {
      name: 'модуль chat-kit',
      args: ['chat-kit'],
      message:
        'ui-module: модуль «chat-kit» — каталог совпал бы со слоем chat-kit канала chat, имя занято',
    },
    {
      name: 'у слоёв кода и каналов есть package, у ui нет',
      args: ['courses'],
      setup: { layers: { ...LAYERS, ui: { dir: 'platform/ui/src' } } },
      message:
        'ui-module: у слоя «ui» нет package — пакеты кода и каналов импортируют описание по имени пакета (layers.ui.package)',
    },
    {
      name: 'раннер при раскладке без пакетов',
      args: ['courses', 'runners/bot'],
      setup: { layers: withoutPackages() },
      message:
        'ui-module: раннер «runners/bot» — у слоёв модуля нет package, подключать нечего',
    },
    {
      name: 'в package.json корня нет dmg-ui',
      args: ['courses'],
      setup: { manifest: { workspaces: WORKSPACES } },
      message:
        'ui-module: dmg-ui нет в package.json корня (dependencies, devDependencies) — версия для пакетов единиц берётся оттуда',
    },
    {
      name: 'package.json корня — массив, не объект',
      args: ['courses'],
      setup: { manifest: [] },
      message: 'package.json корня — не объект JSON',
    },
    {
      name: 'package.json корня — null, не объект',
      args: ['courses'],
      setup: { manifest: null },
      message: 'package.json корня — не объект JSON',
    },
    {
      name: 'у корня нет package.json',
      args: ['courses'],
      setup: { manifest: undefined },
      message:
        'ui-module: dmg-ui нет в package.json корня (dependencies, devDependencies) — версия для пакетов единиц берётся оттуда',
    },
  ];

  for (const { name, args, setup, message } of cases) {
    it(`отказ GenError: ${name}`, () => {
      expect(refusal(planIn(args, setup).plan)).toBe(message);
    });
  }

  it('отказ GenError: package.json корня — не JSON', () => {
    const { plan } = planIn(['courses'], { rawManifest: '{ "workspaces": ' });

    expect(refusal(plan)).toStartWith('package.json корня — не JSON');
  });

  for (const layer of ['ui', 'fe-logic']) {
    it(`отказ GenError текстом dmg-core: нет слоя «${layer}»`, () => {
      const { plan } = planIn(['courses'], { layers: without(layer) });

      expect(refusal(plan)).toBe(
        `слой «${layer}» не задан в .dmg/config.json (layers)`,
      );
    });
  }
});
