import { describe, expect, it } from 'bun:test';
import { relative } from 'node:path';
import {
  GenError,
  GenLayout,
  type GenPlan,
  type LayerPlace,
  ProjectConfig,
} from 'dmg-core/gen';
import { NotificationKind } from './notification-kind';

// План вида `notification`: файлы в трёх деревьях модуля, правки по
// маркерам, тексты (без `event`: событие домена вид не знает), заметки и
// отказы. Общий построитель узла с `screen` — повторов его случаев здесь нет.

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

const without = (...names: string[]): Record<string, LayerPlace> =>
  Object.fromEntries(
    Object.entries(LAYERS).filter(([name]) => !names.includes(name)),
  );

const withoutPackages = (): Record<string, LayerPlace> =>
  Object.fromEntries(
    Object.entries(LAYERS).map(([name, place]) => [name, { dir: place.dir }]),
  );

const planOf = (
  args: string[],
  layers: Record<string, LayerPlace> = LAYERS,
): GenPlan =>
  new NotificationKind().plan(args, {
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

const OPENED_LOADER = [
  '    CodeLoader.notification(',
  '      CourseOpenedNotificationDef,',
  '      async () =>',
  '        new (',
  "          await import('./shared/course-opened.ncode')",
  '        ).CourseOpenedNotificationCode(),',
  '    ),',
].join('\n');

const OPENED_EDITS: Record<string, Edit[]> = {
  'frontend/courses/chat/src/courses-chat.views.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseOpenedView } from './shared/course-opened.view';",
    },
    { marker: '// gen:views', line: '  CourseOpenedView,' },
  ],
  'frontend/courses/logic/src/courses-codes.ts': [
    { marker: '// gen:imports', line: "import { CodeLoader } from 'dmg-ui';" },
    {
      marker: '// gen:imports',
      line: "import { CourseOpenedNotificationDef } from '@acme/ui';",
    },
    { marker: '// gen:codes', line: OPENED_LOADER },
  ],
  'frontend/courses/web/src/courses-web.views.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseOpenedView } from './shared/course-opened.view';",
    },
    { marker: '// gen:views', line: '  CourseOpenedView,' },
  ],
  'platform/ui/src/courses/courses.ui-module.ts': [
    {
      marker: '// gen:imports',
      line: "import { CourseOpenedNotificationDef } from './shared/course-opened.notification';",
    },
    {
      marker: '// gen:notifications',
      line: '    CourseOpenedNotificationDef,',
    },
  ],
  'platform/ui/src/index.ts': [
    {
      marker: '// gen:exports',
      line: "export { CourseOpenedNotificationDef } from './courses/shared/course-opened.notification';",
    },
  ],
};

const NOTE_TELEGRAM =
  'Канал «telegram»: представление не создано — шаблоны есть для chat и web; канал на базе держит только перекрытия.';
const NOTE_NO_CHANNELS = 'Каналов в layers нет: представления не созданы.';
const NOTE_EVENT =
  'Заполни event (событие домена) в platform/ui/src/courses/shared/course-opened.notification.ts — без него файл не соберётся.';

describe('NotificationKind — план «courses shared course-opened»', () => {
  it('файлы: описание, код и представления chat и web; telegram без файлов', () => {
    const plan = planOf(['courses', 'shared', 'course-opened']);

    expect(paths(plan)).toEqual([
      'frontend/courses/chat/src/shared/course-opened.view.ts',
      'frontend/courses/logic/src/shared/course-opened.ncode.ts',
      'frontend/courses/web/src/shared/course-opened.view.ts',
      'platform/ui/src/courses/shared/course-opened.notification.ts',
    ]);
  });

  it('правки: модуль, набор описания, реестры кода и представлений', () => {
    const plan = planOf(['courses', 'shared', 'course-opened']);

    expect(editsByFile(plan)).toEqual(sortedEdits(OPENED_EDITS));
  });

  it('уведомление в папке сторис: файлы в её папке, файла сторис в правках нет', () => {
    const plan = planOf(['courses', 'browse', 'course-opened']);

    expect(paths(plan)).toEqual([
      'frontend/courses/chat/src/browse/course-opened.view.ts',
      'frontend/courses/logic/src/browse/course-opened.ncode.ts',
      'frontend/courses/web/src/browse/course-opened.view.ts',
      'platform/ui/src/courses/browse/course-opened.notification.ts',
    ]);
    expect(Object.keys(editsByFile(plan)).sort()).toEqual(
      Object.keys(OPENED_EDITS),
    );
  });
});

describe('NotificationKind — тексты файлов', () => {
  const texts = () => {
    const plan = planOf(['courses', 'shared', 'course-opened']);
    return (path: string) => textOf(plan, path);
  };

  it('описание: NotificationDef.define с получателями из payload, TODO в подписях и без event', () => {
    const text = texts()(
      'platform/ui/src/courses/shared/course-opened.notification.ts',
    );

    expect(text).toContain("import { NotificationDef } from 'dmg-ui';");
    expect(text).toContain("import * as v from 'valibot';");
    expect(text).toContain(
      'export const CourseOpenedNotificationDef = NotificationDef.define({',
    );
    expect(text).toContain("name: 'courseOpened',");
    expect(text.match(/label: 'TODO/g)).toHaveLength(1);
    expect(text.match(/description: 'TODO/g)).toHaveLength(1);
    expect(text).toContain("recipients: { from: 'payload', fields: [] },");
    expect(text).toContain('reads: [],');
    expect(text).toContain('data: v.object({}),');
    expect(text).not.toMatch(/^\s*event:/m);
    expect(text).toMatch(/^\s*\/\/ TODO.*event/m);
  });

  it('код: класс от NotificationCode с заглушкой load, бросающей ошибку; описание — тип из @acme/ui', () => {
    const text = texts()(
      'frontend/courses/logic/src/shared/course-opened.ncode.ts',
    );

    expect(text).toContain("import { NotificationCode } from 'dmg-ui';");
    expect(text).toContain(
      "import type { CourseOpenedNotificationDef } from '@acme/ui';",
    );
    expect(text).toContain(
      'export class CourseOpenedNotificationCode extends NotificationCode<',
    );
    expect(text).toContain('typeof CourseOpenedNotificationDef');
    expect(text).toContain('override async load(): Promise<never> {');
    expect(text).toContain("throw new Error('TODO");
  });

  it('представление chat: NotificationPresenter.for из dmg-ui/chat-ui, подпись — label описания', () => {
    const text = texts()(
      'frontend/courses/chat/src/shared/course-opened.view.ts',
    );

    expect(text).toContain(
      `import { NotificationPresenter } from '${CHAT_UI}';`,
    );
    expect(text).toContain(
      "import { CourseOpenedNotificationDef } from '@acme/ui';",
    );
    expect(text).toContain(
      'export const CourseOpenedView = NotificationPresenter.for(',
    );
    expect(text).toContain('() => CourseOpenedNotificationDef.label');
  });

  it('представление web: PageNotePresenter.for из dmg-ui/web-ui', () => {
    const text = texts()(
      'frontend/courses/web/src/shared/course-opened.view.ts',
    );

    expect(text).toContain(`import { PageNotePresenter } from '${WEB_UI}';`);
    expect(text).toContain(
      "import { CourseOpenedNotificationDef } from '@acme/ui';",
    );
    expect(text).toContain(
      'export const CourseOpenedView = PageNotePresenter.for(',
    );
    expect(text).toContain('() => CourseOpenedNotificationDef.label');
  });

  it('раскладка без package: описание импортируется относительным путём от каталога файла', () => {
    const plan = planOf(
      ['courses', 'shared', 'course-opened'],
      withoutPackages(),
    );

    for (const path of [
      'frontend/courses/logic/src/shared/course-opened.ncode.ts',
      'frontend/courses/chat/src/shared/course-opened.view.ts',
      'frontend/courses/web/src/shared/course-opened.view.ts',
    ]) {
      expect(textOf(plan, path)).toContain(`from '${UI_FROM_KIND}';`);
    }
  });
});

describe('NotificationKind — заметки', () => {
  const cases: {
    name: string;
    layers?: Record<string, LayerPlace>;
    notes: string[];
  }[] = [
    {
      name: 'канал telegram без шаблона',
      notes: [NOTE_TELEGRAM, NOTE_EVENT],
    },
    {
      name: 'все каналы с шаблоном',
      layers: without('fe-telegram'),
      notes: [NOTE_EVENT],
    },
    {
      name: 'каналов в layers нет',
      layers: without('fe-chat', 'fe-telegram', 'fe-web', 'chat-kit'),
      notes: [NOTE_NO_CHANNELS, NOTE_EVENT],
    },
  ];

  for (const { name, layers, notes } of cases) {
    it(`заметки: ${name}`, () => {
      expect(
        planOf(['courses', 'shared', 'course-opened'], layers).notes,
      ).toEqual(notes);
    });
  }

  it('заметка о event называет путь файла уведомления от корня', () => {
    const plan = planOf(['courses', 'browse', 'course-opened']);

    expect(plan.notes).toContain(
      'Заполни event (событие домена) в platform/ui/src/courses/browse/course-opened.notification.ts — без него файл не соберётся.',
    );
  });
});

describe('NotificationKind — отказы', () => {
  const USAGE =
    'Для «notification» нужны модуль, папка и уведомление — notification <модуль> <папка> <уведомление>';
  const NO_UI = 'слой «ui» не задан в .dmg/config.json (layers)';
  const NO_LOGIC = 'слой «fe-logic» не задан в .dmg/config.json (layers)';
  const KEBAB = '— имя в kebab-case (a-z, 0-9, дефисы)';

  const cases: {
    name: string;
    args: string[];
    layers?: Record<string, LayerPlace>;
    message: string;
  }[] = [
    { name: 'нет аргументов', args: [], message: USAGE },
    { name: 'только модуль', args: ['courses'], message: USAGE },
    { name: 'модуль и папка', args: ['courses', 'shared'], message: USAGE },
    {
      name: 'модуль не в kebab-case',
      args: ['Courses', 'shared', 'course-opened'],
      message: `notification: модуль «Courses» ${KEBAB}`,
    },
    {
      name: 'папка не в kebab-case',
      args: ['courses', 'Shared', 'course-opened'],
      message: `notification: папка «Shared» ${KEBAB}`,
    },
    {
      name: 'уведомление не в kebab-case',
      args: ['courses', 'shared', 'courseOpened'],
      message: `notification: уведомление «courseOpened» ${KEBAB}`,
    },
    {
      name: 'нет слоя ui — текст dmg-core',
      args: ['courses', 'shared', 'course-opened'],
      layers: without('ui'),
      message: NO_UI,
    },
    {
      name: 'нет слоя fe-logic — текст dmg-core',
      args: ['courses', 'shared', 'course-opened'],
      layers: without('fe-logic'),
      message: NO_LOGIC,
    },
    {
      name: 'лишние аргументы',
      args: ['courses', 'shared', 'course-opened', 'extra'],
      message:
        'notification: лишние аргументы — notification <модуль> <папка> <уведомление>',
    },
  ];

  for (const { name, args, layers, message } of cases) {
    it(`отказ GenError: ${name}`, () => {
      expect(refusal(() => planOf(args, layers))).toBe(message);
    });
  }
});
