import { describe, expect, it } from 'bun:test';
import { relative } from 'node:path';
import {
  GenError,
  GenLayout,
  type GenPlan,
  type LayerPlace,
  ProjectConfig,
} from 'dmg-core/gen';
import { StoryKind } from './story-kind';

// План вида `story`: файл сторис и план её экрана `start` (файлы в трёх
// деревьях модуля), правки по маркерам, тексты, заметки и отказы. Случаи
// самого экрана — в тестах вида `screen`; здесь только то, что добавляет сторис.

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

const without = (...names: string[]): Record<string, LayerPlace> =>
  Object.fromEntries(
    Object.entries(LAYERS).filter(([name]) => !names.includes(name)),
  );

const planOf = (
  args: string[],
  layers: Record<string, LayerPlace> = LAYERS,
): GenPlan =>
  new StoryKind().plan(args, {
    layout: GenLayout.from(ProjectConfig.parse({ layers }), ROOT),
  });

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
const editsByFile = (plan: GenPlan): Record<string, Edit[]> => {
  const byFile: Record<string, Edit[]> = {};
  for (const { path, marker, line } of plan.edits) {
    const file = relative(ROOT, path);
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

const paths = (plan: GenPlan) =>
  plan.files.map((file) => relative(ROOT, file.path)).sort();

const textOf = (plan: GenPlan, path: string): string => {
  const file = plan.files.find((f) => relative(ROOT, f.path) === path);
  if (file === undefined) throw new Error(`в плане нет файла ${path}`);
  return file.content;
};

const STORY = 'platform/ui/src/courses/browse/browse.story.ts';

const LIST_LOADER = [
  '    CodeLoader.screen(',
  '      CourseListScreenDef,',
  '      async () =>',
  "        new (await import('./browse/course-list.scode')).CourseListScreenCode(),",
  '    ),',
].join('\n');

const LIST_EDITS: Record<string, Edit[]> = {
  'frontend/courses/chat/src/courses-chat.views.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseListView } from './browse/course-list.view';",
    },
    { marker: '// gen:views', line: '  CourseListView,' },
  ],
  'frontend/courses/logic/src/courses-codes.ts': [
    { marker: '// gen:imports', line: "import { CodeLoader } from 'dmg-ui';" },
    {
      marker: '// gen:imports',
      line: "import { CourseListScreenDef } from '@acme/ui';",
    },
    { marker: '// gen:codes', line: LIST_LOADER },
  ],
  'frontend/courses/web/src/courses-web.views.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseListView } from './browse/course-list.view';",
    },
    { marker: '// gen:views', line: '  CourseListView,' },
  ],
  'platform/ui/src/courses/courses.ui-module.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseListScreenDef } from './browse/course-list.screen';",
    },
    { marker: '// gen:screens', line: '    CourseListScreenDef,' },
    {
      marker: '// gen:imports',
      line: "import { BrowseStoryDef } from './browse/browse.story';",
    },
    { marker: '// gen:stories', line: '    BrowseStoryDef,' },
  ],
  'platform/ui/src/index.ts': [
    {
      marker: '// gen:exports',
      line: "export { CourseListScreenDef } from './courses/browse/course-list.screen';",
    },
    {
      marker: '// gen:exports',
      line: "export { BrowseStoryDef } from './courses/browse/browse.story';",
    },
  ],
};

const NOTE_TELEGRAM =
  'Канал «telegram»: представление не создано — шаблоны есть для chat и web; канал на базе держит только перекрытия.';
const NOTE_NO_CHANNELS = 'Каналов в layers нет: представления не созданы.';
const NOTE_STORY =
  "Подключи BrowseStoryDef к stories приложения UI (*.ui-app.ts) или к leads другой сторис; callers: ['user'] — поправь, если сторис для guest или system.";

describe('StoryKind — план «courses browse course-list»', () => {
  it('файлы: сторис, а с ней описание, код и представления экрана start', () => {
    const plan = planOf(['courses', 'browse', 'course-list']);

    expect(paths(plan)).toEqual([
      'frontend/courses/chat/src/browse/course-list.view.ts',
      'frontend/courses/logic/src/browse/course-list.scode.ts',
      'frontend/courses/web/src/browse/course-list.view.ts',
      'platform/ui/src/courses/browse/browse.story.ts',
      'platform/ui/src/courses/browse/course-list.screen.ts',
    ]);
  });

  it('правки: экран start и сама сторис; экран в файл сторис шаблон уже вписал', () => {
    const plan = planOf(['courses', 'browse', 'course-list']);

    // Правки экрана в файл сторис — вставка в её же шаблон: в плане их может
    // не быть, итог без дублей закреплён тестом применённого плана.
    const others = Object.entries(editsByFile(plan)).filter(
      ([path]) => path !== STORY,
    );
    expect(Object.fromEntries(others)).toEqual(sortedEdits(LIST_EDITS));
  });
});

describe('StoryKind — тексты файлов', () => {
  const story = () =>
    textOf(
      planOf(['courses', 'browse', 'course-list']),
      'platform/ui/src/courses/browse/browse.story.ts',
    );

  it('сторис: StoryDef.define с экраном start, маркерами списков и TODO', () => {
    const text = story();

    expect(text).toContain("import { StoryDef } from 'dmg-ui';");
    expect(text).toContain(
      "import { CourseListScreenDef } from './course-list.screen';",
    );
    expect(text).toContain('// gen:imports');
    expect(text).toContain('export const BrowseStoryDef = StoryDef.define({');
    expect(text).toContain("name: 'browse',");
    expect(text).toContain("callers: ['user'],");
    expect(text).toContain("goal: 'TODO: чтобы");
    expect(text).toContain('start: CourseListScreenDef,');
    expect(text).toContain('// gen:screens');
    expect(text.match(/label: 'TODO/g)).toHaveLength(2);
    expect(text.match(/description: 'TODO/g)).toHaveLength(2);
  });

  it('сторис: экран start — в screens, исход done ведёт на выход done экрана', () => {
    const text = story();

    expect(text).toMatch(
      /screens: \[\s+CourseListScreenDef,\s+\/\/ gen:screens/,
    );
    expect(text).toMatch(/outcomes: \{\s+done: \{/);
    expect(text).toContain('exits: [CourseListScreenDef.exits.done]');
  });

  it('экран start — файлы экрана плана тоже есть: описание в папке сторис', () => {
    const plan = planOf(['courses', 'browse', 'course-list']);

    expect(
      textOf(plan, 'platform/ui/src/courses/browse/course-list.screen.ts'),
    ).toContain('export const CourseListScreenDef = ScreenDef.define({');
  });
});

describe('StoryKind — заметки', () => {
  const cases: {
    name: string;
    layers?: Record<string, LayerPlace>;
    notes: string[];
  }[] = [
    {
      name: 'канал telegram без шаблона: затем подключение сторис',
      notes: [NOTE_TELEGRAM, NOTE_STORY],
    },
    {
      name: 'все каналы с шаблоном',
      layers: without('fe-telegram'),
      notes: [NOTE_STORY],
    },
    {
      name: 'каналов в layers нет',
      layers: without('fe-chat', 'fe-telegram', 'fe-web', 'chat-kit'),
      notes: [NOTE_NO_CHANNELS, NOTE_STORY],
    },
  ];

  for (const { name, layers, notes } of cases) {
    it(`заметки: ${name}`, () => {
      expect(
        planOf(['courses', 'browse', 'course-list'], layers).notes,
      ).toEqual(notes);
    });
  }
});

describe('StoryKind — отказы', () => {
  const USAGE =
    'Для «story» нужны модуль, сторис и экран — story <модуль> <сторис> <экран>';
  const NO_UI = 'слой «ui» не задан в .dmg/config.json (layers)';
  const NO_LOGIC = 'слой «fe-logic» не задан в .dmg/config.json (layers)';
  const KEBAB = '— имя в kebab-case (a-z, 0-9, дефисы)';
  const SHARED =
    'story: сторис «shared» — имя папки занято общими экранами и уведомлениями';

  const cases: {
    name: string;
    args: string[];
    layers?: Record<string, LayerPlace>;
    message: string;
  }[] = [
    { name: 'нет аргументов', args: [], message: USAGE },
    { name: 'только модуль', args: ['courses'], message: USAGE },
    { name: 'модуль и сторис', args: ['courses', 'browse'], message: USAGE },
    {
      name: 'модуль не в kebab-case',
      args: ['Courses', 'browse', 'course-list'],
      message: `story: модуль «Courses» ${KEBAB}`,
    },
    {
      name: 'сторис не в kebab-case',
      args: ['courses', 'Browse', 'course-list'],
      message: `story: сторис «Browse» ${KEBAB}`,
    },
    {
      name: 'экран не в kebab-case',
      args: ['courses', 'browse', 'courseList'],
      message: `story: экран «courseList» ${KEBAB}`,
    },
    {
      name: 'нет слоя ui — текст dmg-core',
      args: ['courses', 'browse', 'course-list'],
      layers: without('ui'),
      message: NO_UI,
    },
    {
      name: 'нет слоя fe-logic — текст dmg-core',
      args: ['courses', 'browse', 'course-list'],
      layers: without('fe-logic'),
      message: NO_LOGIC,
    },
    {
      name: 'сторис shared — папка занята общими экранами и уведомлениями',
      args: ['courses', 'shared', 'course-list'],
      message: SHARED,
    },
    {
      name: 'сторис shared, но экран не kebab — имя раньше',
      args: ['courses', 'shared', 'courseList'],
      message: `story: экран «courseList» ${KEBAB}`,
    },
    {
      name: 'сторис shared, но нет слоя ui — слой раньше',
      args: ['courses', 'shared', 'course-list'],
      layers: without('ui'),
      message: NO_UI,
    },
    {
      name: 'лишние аргументы',
      args: ['courses', 'browse', 'course-list', 'extra'],
      message: 'story: лишние аргументы — story <модуль> <сторис> <экран>',
    },
    {
      name: 'сторис shared и лишние аргументы — shared раньше',
      args: ['courses', 'shared', 'course-list', 'extra'],
      message: SHARED,
    },
  ];

  for (const { name, args, layers, message } of cases) {
    it(`отказ GenError: ${name}`, () => {
      expect(refusal(() => planOf(args, layers))).toBe(message);
    });
  }
});
