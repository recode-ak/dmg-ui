import { describe, expect, it } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import {
  GenError,
  GenLayout,
  type GenPlan,
  type LayerPlace,
  ProjectConfig,
} from 'dmg-core/gen';
import { useTempDir } from 'dmg-core/testing';
import { ScreenKind } from './screen-kind';

// План вида `screen`: файлы в трёх деревьях модуля, правки по маркерам,
// тексты, заметки и отказы. Пакетная раскладка — как у потребителя с
// пакетами; раскладка без пакетов проверяет относительный импорт описания.

const ROOT = '/acme-project';

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

// Спецификаторы входов каналов и относительные пути вверх — в константах:
// строка теста `from '…'` читалась бы проверкой направлений как импорт файла.
const CHAT_UI = 'dmg-ui/chat-ui';
const WEB_UI = 'dmg-ui/web-ui';
const UI_FROM_KIND = '../../../../../platform/ui/src';
const UI_FROM_CODES = '../../../../platform/ui/src';

const without = (...names: string[]): Record<string, LayerPlace> =>
  Object.fromEntries(
    Object.entries(LAYERS).filter(([name]) => !names.includes(name)),
  );

const withoutPackages = (): Record<string, LayerPlace> =>
  Object.fromEntries(
    Object.entries(LAYERS).map(([name, place]) => [name, { dir: place.dir }]),
  );

const tmp = useTempDir('dmg-ui-gen-screen-');

const layoutOf = (layers: Record<string, LayerPlace>, root = ROOT) =>
  GenLayout.from(ProjectConfig.parse({ layers }), root);

const planOf = (
  args: string[],
  layers: Record<string, LayerPlace> = LAYERS,
  root = ROOT,
): GenPlan => new ScreenKind().plan(args, { layout: layoutOf(layers, root) });

const refusal = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    if (GenError.is(error)) return error.message;
    throw error;
  }
  return 'отказа нет';
};

type Edit = { marker: string; line: string };

const bySlot = (a: Edit, b: Edit) =>
  `${a.marker}\n${a.line}`.localeCompare(`${b.marker}\n${b.line}`);

/** Правки плана по файлам (путь от корня); порядок внутри файла не закреплён */
const editsByFile = (plan: GenPlan, root = ROOT): Record<string, Edit[]> => {
  const byFile: Record<string, Edit[]> = {};
  for (const { path, marker, line } of plan.edits) {
    const file = relative(root, path);
    byFile[file] = [...(byFile[file] ?? []), { marker, line }];
  }
  for (const edits of Object.values(byFile)) edits.sort(bySlot);
  return byFile;
};

const sortedEdits = (expected: Record<string, Edit[]>) =>
  Object.fromEntries(
    Object.entries(expected).map(([path, edits]) => [
      path,
      [...edits].sort(bySlot),
    ]),
  );

const paths = (plan: GenPlan, root = ROOT) =>
  plan.files.map((file) => relative(root, file.path)).sort();

const textOf = (plan: GenPlan, path: string, root = ROOT): string => {
  const file = plan.files.find((f) => relative(root, f.path) === path);
  if (file === undefined) throw new Error(`в плане нет файла ${path}`);
  return file.content;
};

const loader = (
  indent: number,
  def: string,
  load: string[],
  factory = 'screen',
): string =>
  [
    `CodeLoader.${factory}(`,
    `  ${def},`,
    '  async () =>',
    ...load.map((line) => `  ${line}`),
    '),',
  ]
    .map((line) => `${' '.repeat(indent)}${line}`)
    .join('\n');

const CARD_FILES = [
  'frontend/courses/chat/src/browse/course-card.view.ts',
  'frontend/courses/logic/src/browse/course-card.scode.ts',
  'frontend/courses/web/src/browse/course-card.view.ts',
  'platform/ui/src/courses/browse/course-card.screen.ts',
];

const CARD_LOADER = loader(4, 'CourseCardScreenDef', [
  "  new (await import('./browse/course-card.scode')).CourseCardScreenCode(),",
]);

const CARD_EDITS: Record<string, Edit[]> = {
  'frontend/courses/chat/src/courses-chat.views.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseCardView } from './browse/course-card.view';",
    },
    { marker: '// gen:views', line: '  CourseCardView,' },
  ],
  'frontend/courses/logic/src/courses-codes.ts': [
    { marker: '// gen:imports', line: "import { CodeLoader } from 'dmg-ui';" },
    {
      marker: '// gen:imports',
      line: "import { CourseCardScreenDef } from '@acme/ui';",
    },
    { marker: '// gen:codes', line: CARD_LOADER },
  ],
  'frontend/courses/web/src/courses-web.views.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseCardView } from './browse/course-card.view';",
    },
    { marker: '// gen:views', line: '  CourseCardView,' },
  ],
  'platform/ui/src/courses/browse/browse.story.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseCardScreenDef } from './course-card.screen';",
    },
    { marker: '// gen:screens', line: '    CourseCardScreenDef,' },
  ],
  'platform/ui/src/courses/courses.ui-module.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseCardScreenDef } from './browse/course-card.screen';",
    },
    { marker: '// gen:screens', line: '    CourseCardScreenDef,' },
  ],
  'platform/ui/src/index.ts': [
    {
      marker: '// gen:exports',
      line: "export { CourseCardScreenDef } from './courses/browse/course-card.screen';",
    },
  ],
};

const NOTE_TELEGRAM =
  'Канал «telegram»: представление не создано — шаблоны есть для chat и web; канал на базе держит только перекрытия.';
const NOTE_NO_CHANNELS = 'Каналов в layers нет: представления не созданы.';
const NOTE_UNREACHABLE =
  'Открой CourseCardScreenDef действием-переходом (to) с экрана сторис — иначе он недостижим (UI-07).';
const NOTE_SHARED =
  'Экран в shared: добавь CourseBadgeScreenDef в screens сторис, которые его открывают.';

describe('ScreenKind — план «courses browse course-card»', () => {
  it('файлы: описание, код и представления chat и web; telegram без файлов', () => {
    const plan = planOf(['courses', 'browse', 'course-card']);

    expect(paths(plan)).toEqual(CARD_FILES);
  });

  it('файлы экрана в shared — в папке shared всех трёх деревьев', () => {
    const plan = planOf(['courses', 'shared', 'course-badge']);

    expect(paths(plan)).toEqual([
      'frontend/courses/chat/src/shared/course-badge.view.ts',
      'frontend/courses/logic/src/shared/course-badge.scode.ts',
      'frontend/courses/web/src/shared/course-badge.view.ts',
      'platform/ui/src/courses/shared/course-badge.screen.ts',
    ]);
  });

  it('правки: модуль, набор описания, сторис папки, реестры кода и представлений', () => {
    const plan = planOf(['courses', 'browse', 'course-card']);

    expect(editsByFile(plan)).toEqual(sortedEdits(CARD_EDITS));
  });

  it('правки экрана в shared — без файла сторис', () => {
    const plan = planOf(['courses', 'shared', 'course-badge']);

    expect(editsByFile(plan)).toEqual(
      sortedEdits({
        'frontend/courses/chat/src/courses-chat.views.ts': [
          {
            marker: '// gen:imports',
            line: "import { CourseBadgeView } from './shared/course-badge.view';",
          },
          { marker: '// gen:views', line: '  CourseBadgeView,' },
        ],
        'frontend/courses/logic/src/courses-codes.ts': [
          {
            marker: '// gen:imports',
            line: "import { CodeLoader } from 'dmg-ui';",
          },
          {
            marker: '// gen:imports',
            line: "import { CourseBadgeScreenDef } from '@acme/ui';",
          },
          {
            marker: '// gen:codes',
            line: loader(4, 'CourseBadgeScreenDef', [
              '  new (',
              "    await import('./shared/course-badge.scode')",
              '  ).CourseBadgeScreenCode(),',
            ]),
          },
        ],
        'frontend/courses/web/src/courses-web.views.ts': [
          {
            marker: '// gen:imports',
            line: "import { CourseBadgeView } from './shared/course-badge.view';",
          },
          { marker: '// gen:views', line: '  CourseBadgeView,' },
        ],
        'platform/ui/src/courses/courses.ui-module.ts': [
          {
            marker: '// gen:imports',
            line: "import { CourseBadgeScreenDef } from './shared/course-badge.screen';",
          },
          { marker: '// gen:screens', line: '    CourseBadgeScreenDef,' },
        ],
        'platform/ui/src/index.ts': [
          {
            marker: '// gen:exports',
            line: "export { CourseBadgeScreenDef } from './courses/shared/course-badge.screen';",
          },
        ],
      }),
    );
  });

  it('правки одного файла связаны группой: не встал импорт — элемент списка тоже вручную', () => {
    const plan = planOf(['courses', 'browse', 'course-card']);

    const groups = new Map<string, Set<string | undefined>>();
    for (const edit of plan.edits) {
      const known = groups.get(edit.path) ?? new Set();
      known.add(edit.group);
      groups.set(edit.path, known);
    }
    const multi = plan.edits.filter(
      (edit) => plan.edits.filter((e) => e.path === edit.path).length > 1,
    );
    expect(multi.length).toBeGreaterThan(0);
    for (const edit of multi) {
      expect(edit.group).toBeDefined();
      expect(groups.get(edit.path)?.size).toBe(1);
    }
    const distinct = new Set(multi.map((edit) => edit.group));
    expect(distinct.size).toBe(new Set(multi.map((edit) => edit.path)).size);
  });

  it('в каждом файле импорты идут в плане раньше элементов списков', () => {
    const plan = planOf(['courses', 'browse', 'course-card']);

    for (const path of new Set(plan.edits.map((edit) => edit.path))) {
      const markers = plan.edits
        .filter((edit) => edit.path === path)
        .map((edit) => edit.marker);
      const lastImport = markers.lastIndexOf('// gen:imports');
      const firstOther = markers.findIndex((m) => m !== '// gen:imports');
      expect(firstOther === -1 || lastImport < firstOther).toBe(true);
    }
  });

  it('длинное имя: загрузчик кода переносится по форме biome', () => {
    const plan = planOf(['courses', 'browse', 'course-details-overview']);

    const codes =
      editsByFile(plan)['frontend/courses/logic/src/courses-codes.ts'];
    expect(codes?.find((edit) => edit.marker === '// gen:codes')?.line).toBe(
      [
        '    CodeLoader.screen(',
        '      CourseDetailsOverviewScreenDef,',
        '      async () =>',
        '        new (',
        "          await import('./browse/course-details-overview.scode')",
        '        ).CourseDetailsOverviewScreenCode(),',
        '    ),',
      ].join('\n'),
    );
  });

  it('отступ элемента — от строки маркера файла на диске', () => {
    const root = tmp().path;
    const put = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    put(
      'platform/ui/src/courses/courses.ui-module.ts',
      '// gen:imports\n\nexport const X = {\n  screens: [\n        // gen:screens\n  ],\n};\n',
    );
    put(
      'platform/ui/src/courses/browse/browse.story.ts',
      '// gen:imports\n\nexport const X = {\n  screens: [\n        // gen:screens\n  ],\n};\n',
    );
    put(
      'frontend/courses/logic/src/courses-codes.ts',
      '// gen:imports\n\nexport const y = [\n  // gen:codes\n];\n',
    );
    put(
      'frontend/courses/chat/src/courses-chat.views.ts',
      '// gen:imports\n\nexport const z = [\n      // gen:views\n];\n',
    );

    const plan = planOf(['courses', 'browse', 'course-card'], LAYERS, root);

    const edits = editsByFile(plan, root);
    const line = (path: string, marker: string) =>
      edits[path]?.find((edit) => edit.marker === marker)?.line;
    expect(
      line('platform/ui/src/courses/courses.ui-module.ts', '// gen:screens'),
    ).toBe('        CourseCardScreenDef,');
    expect(
      line('platform/ui/src/courses/browse/browse.story.ts', '// gen:screens'),
    ).toBe('        CourseCardScreenDef,');
    expect(
      line('frontend/courses/logic/src/courses-codes.ts', '// gen:codes'),
    ).toBe(
      loader(2, 'CourseCardScreenDef', [
        "  new (await import('./browse/course-card.scode')).CourseCardScreenCode(),",
      ]),
    );
    expect(
      line('frontend/courses/chat/src/courses-chat.views.ts', '// gen:views'),
    ).toBe('      CourseCardView,');
    // файла нет на диске — отступ формы шаблона
    expect(
      line('frontend/courses/web/src/courses-web.views.ts', '// gen:views'),
    ).toBe('  CourseCardView,');
  });
});

describe('ScreenKind — тексты файлов', () => {
  const texts = () => {
    const plan = planOf(['courses', 'browse', 'course-card']);
    return (path: string) => textOf(plan, path);
  };

  it('описание: ScreenDef.define с TODO в подписях, пустыми reads и data и выходом done', () => {
    const text = texts()(
      'platform/ui/src/courses/browse/course-card.screen.ts',
    );

    expect(text).toContain("import { ScreenDef } from 'dmg-ui';");
    expect(text).toContain("import * as v from 'valibot';");
    expect(text).toContain(
      'export const CourseCardScreenDef = ScreenDef.define({',
    );
    expect(text).toContain("name: 'courseCard',");
    expect(text.match(/label: 'TODO/g)).toHaveLength(2);
    expect(text.match(/description: 'TODO/g)).toHaveLength(2);
    expect(text).toContain('reads: [],');
    expect(text).toContain('data: v.object({}),');
    expect(text).toMatch(/exits: \{\s+done: \{/);
  });

  it('код: класс от ScreenCode с заглушкой load, бросающей ошибку; описание — тип из @acme/ui', () => {
    const text = texts()(
      'frontend/courses/logic/src/browse/course-card.scode.ts',
    );

    expect(text).toContain("import { ScreenCode } from 'dmg-ui';");
    expect(text).toContain(
      "import type { CourseCardScreenDef } from '@acme/ui';",
    );
    expect(text).toContain(
      'export class CourseCardScreenCode extends ScreenCode<',
    );
    expect(text).toContain('typeof CourseCardScreenDef');
    expect(text).toContain('override async load(): Promise<never> {');
    expect(text).toContain("throw new Error('TODO");
  });

  it('представление chat: ScreenPresenter.for из dmg-ui/chat-ui, подпись — label описания', () => {
    const text = texts()(
      'frontend/courses/chat/src/browse/course-card.view.ts',
    );

    expect(text).toContain(`import { ScreenPresenter } from '${CHAT_UI}';`);
    expect(text).toContain("import { CourseCardScreenDef } from '@acme/ui';");
    expect(text).toContain(
      'export const CourseCardView = ScreenPresenter.for(',
    );
    expect(text).toContain('() => CourseCardScreenDef.label');
  });

  it('представление web: PagePresenter.for из dmg-ui/web-ui', () => {
    const text = texts()('frontend/courses/web/src/browse/course-card.view.ts');

    expect(text).toContain(`import { PagePresenter } from '${WEB_UI}';`);
    expect(text).toContain("import { CourseCardScreenDef } from '@acme/ui';");
    expect(text).toContain('export const CourseCardView = PagePresenter.for(');
    expect(text).toContain('() => CourseCardScreenDef.label');
  });

  it('раскладка без package: описание импортируется относительным путём от каталога файла', () => {
    const plan = planOf(
      ['courses', 'browse', 'course-card'],
      withoutPackages(),
    );

    for (const path of [
      'frontend/courses/logic/src/browse/course-card.scode.ts',
      'frontend/courses/chat/src/browse/course-card.view.ts',
      'frontend/courses/web/src/browse/course-card.view.ts',
    ]) {
      expect(textOf(plan, path)).toContain(`from '${UI_FROM_KIND}';`);
    }
    expect(
      editsByFile(plan)['frontend/courses/logic/src/courses-codes.ts'],
    ).toContainEqual({
      marker: '// gen:imports',
      line: `import { CourseCardScreenDef } from '${UI_FROM_CODES}';`,
    });
  });
});

describe('ScreenKind — заметки', () => {
  const cases: {
    name: string;
    args: string[];
    layers?: Record<string, LayerPlace>;
    notes: string[];
  }[] = [
    {
      name: 'экран в папке сторис, канал telegram без шаблона',
      args: ['courses', 'browse', 'course-card'],
      notes: [NOTE_TELEGRAM, NOTE_UNREACHABLE],
    },
    {
      name: 'экран в shared, канал telegram без шаблона',
      args: ['courses', 'shared', 'course-badge'],
      notes: [NOTE_SHARED, NOTE_TELEGRAM],
    },
    {
      name: 'все каналы с шаблоном — заметки только о переходе',
      args: ['courses', 'browse', 'course-card'],
      layers: without('fe-telegram'),
      notes: [NOTE_UNREACHABLE],
    },
    {
      name: 'каналов в layers нет',
      args: ['courses', 'browse', 'course-card'],
      layers: without('fe-chat', 'fe-telegram', 'fe-web', 'chat-kit'),
      notes: [NOTE_NO_CHANNELS, NOTE_UNREACHABLE],
    },
  ];

  for (const { name, args, layers, notes } of cases) {
    it(`заметки: ${name}`, () => {
      expect(planOf(args, layers).notes).toEqual(notes);
    });
  }

  it('каналов в layers нет — не отказ: описание и код без представлений, правок реестров представлений нет', () => {
    const plan = planOf(
      ['courses', 'browse', 'course-card'],
      without('fe-chat', 'fe-telegram', 'fe-web', 'chat-kit'),
    );

    expect(paths(plan)).toEqual([
      'frontend/courses/logic/src/browse/course-card.scode.ts',
      'platform/ui/src/courses/browse/course-card.screen.ts',
    ]);
    expect(Object.keys(editsByFile(plan)).sort()).toEqual([
      'frontend/courses/logic/src/courses-codes.ts',
      'platform/ui/src/courses/browse/browse.story.ts',
      'platform/ui/src/courses/courses.ui-module.ts',
      'platform/ui/src/index.ts',
    ]);
  });
});

describe('ScreenKind — отказы', () => {
  const MISSING = (what: string) =>
    `Для «screen» нужны ${what} — screen <модуль> <папка> <экран>`;
  const USAGE = MISSING('модуль, папка и экран');
  const NO_UI = 'слой «ui» не задан в .dmg/config.json (layers)';
  const NO_LOGIC = 'слой «fe-logic» не задан в .dmg/config.json (layers)';

  const cases: {
    name: string;
    args: string[];
    layers?: Record<string, LayerPlace>;
    message: string;
  }[] = [
    { name: 'нет аргументов', args: [], message: USAGE },
    { name: 'только модуль', args: ['courses'], message: USAGE },
    { name: 'модуль и папка', args: ['courses', 'browse'], message: USAGE },
    {
      name: 'модуль не в kebab-case',
      args: ['Courses', 'browse', 'course-card'],
      message: 'screen: модуль «Courses» — имя в kebab-case (a-z, 0-9, дефисы)',
    },
    {
      name: 'папка не в kebab-case',
      args: ['courses', 'Browse', 'course-card'],
      message: 'screen: папка «Browse» — имя в kebab-case (a-z, 0-9, дефисы)',
    },
    {
      name: 'экран не в kebab-case',
      args: ['courses', 'browse', 'courseCard'],
      message:
        'screen: экран «courseCard» — имя в kebab-case (a-z, 0-9, дефисы)',
    },
    {
      name: 'имя не kebab раньше отсутствия слоя',
      args: ['Courses', 'browse', 'course-card'],
      layers: without('ui'),
      message: 'screen: модуль «Courses» — имя в kebab-case (a-z, 0-9, дефисы)',
    },
    {
      name: 'нет слоя ui — текст dmg-core',
      args: ['courses', 'browse', 'course-card'],
      layers: without('ui'),
      message: NO_UI,
    },
    {
      name: 'нет слоя fe-logic — текст dmg-core',
      args: ['courses', 'browse', 'course-card'],
      layers: without('fe-logic'),
      message: NO_LOGIC,
    },
    {
      name: 'лишние аргументы',
      args: ['courses', 'browse', 'course-card', 'extra'],
      message: 'screen: лишние аргументы — screen <модуль> <папка> <экран>',
    },
    {
      name: 'лишние аргументы, но имя не kebab — имя раньше',
      args: ['courses', 'browse', 'courseCard', 'extra'],
      message:
        'screen: экран «courseCard» — имя в kebab-case (a-z, 0-9, дефисы)',
    },
    {
      name: 'лишние аргументы, но нет слоя ui — слой раньше',
      args: ['courses', 'browse', 'course-card', 'extra'],
      layers: without('ui'),
      message: NO_UI,
    },
  ];

  for (const { name, args, layers, message } of cases) {
    it(`отказ GenError: ${name}`, () => {
      expect(refusal(() => planOf(args, layers))).toBe(message);
    });
  }
});
