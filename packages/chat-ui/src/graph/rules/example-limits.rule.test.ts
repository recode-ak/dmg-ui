import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import type { ArchApp } from 'dmg-core/arch';
import { AppGraph, Graph, type GraphProvider } from 'dmg-core/graph';
import {
  ExampleAppDef,
  ListTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import {
  type AnyUiAppDef,
  type AnyUiSetDef,
  CodeLoader,
  CodeLoaders,
  NotificationCode,
  NotificationDef,
  ScreenCode,
  ScreenDef,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import {
  ExampleUiSetDef,
  exampleCodes,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
} from 'dmg-ui/testing';
import { ArchReport, UiScene } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import {
  ExampleDialogUiAppDef,
  ExampleWindowedUiAppDef,
  exampleDialogViews,
  MemoryMessenger,
} from '../../../testing';
import { AssignedTasksView } from '../../../testing/example/assigned-tasks.view';
import { MainMenuView } from '../../../testing/example/main-menu.view';
import { TaskAssignedView } from '../../../testing/example/task-assigned.view';
import { TaskCompletedView } from '../../../testing/example/task-completed.view';
import { TaskListView } from '../../../testing/example/task-list.view';
import { UserCardView } from '../../../testing/example/user-card.view';
import { DIALOG_CHANNEL } from '../../dialog';
import type { MessengerCapabilities } from '../../messenger/messenger.types';
import { ChatViews } from '../../view/chat-views';
import { NotificationPresenter } from '../../view/notification-presenter';
import { ScreenPresenter } from '../../view/screen-presenter';
import { ChatExamples } from '../chat-examples';
import { ChatGraphProvider } from '../chat-graph-provider';

// CH-01: пример экрана и уведомления укладывается в лимиты мессенджера
// своего приложения. Экран меряется как показ с «Назад» (худший случай):
// последнее сообщение — по `textWithOptions`, остальные — по `text`,
// подписи вариантов — по `options.label`; число вариантов не нарушение.
// Уведомление: без ссылок — `text`, со ссылками — `textWithOptions`,
// подпись ссылки — `label` экрана-цели, число ссылок — по `options.max`
// (беседа ссылки не раскладывает). Сцены ставят точку входа на каждый
// вход приложения (без неё CH-02 даёт код 1) и проверяют строки CH-01.

const EDITING = MemoryMessenger.editing().capabilities;

const DIALOG = 'exampleDialog';
const WINDOWED = 'exampleWindowed';
const LIST = 'exampleUi/todo/taskList';
const CARD = 'exampleUi/todo/taskCard';

/** Данные примеров и тексты представлений учебного набора — их нет в нарушениях (ERR-07). */
const EXAMPLE_TEXTS = [
  'Хлеб',
  'Молоко',
  'Сыр',
  'Мои задачи',
  'Задач пока нет',
  'Назначенные мне',
  'Статус',
];

/** Просторные возможности с урезанными полями — подставной мессенджер сцены. */
const tight = (
  over: Partial<MessengerCapabilities>,
): MessengerCapabilities => ({
  ...EDITING,
  name: 'memory-tight',
  ...over,
});

/** Лимит подписи варианта при прочих просторных лимитах вариантов. */
const labelLimit = (max: number): MessengerCapabilities['options'] => ({
  ...EDITING.options,
  label: { max, unit: 'grapheme' },
});

type AppSpec = {
  readonly app: AnyUiAppDef;
  readonly views: ChatViews;
  readonly capabilities: MessengerCapabilities;
};

const EXAMPLES = await ChatExamples.collect({
  set: ExampleUiSetDef,
  codes: exampleCodes(),
});

/** По точке входа на каждый вход приложения; `via` и `key` — нейтральные слова сцены. */
const pointsOf = (app: AnyUiAppDef) =>
  Object.keys(app.entries).map((entry) => ({
    entry,
    via: 'message',
    key: entry,
  }));

/** Сцена без домена: поставщик `dmg-ui` и `ChatGraphProvider` на `apps` с точкой на каждый вход. */
const sceneOf = (
  set: AnyUiSetDef,
  apps: readonly AppSpec[],
  examples: ChatExamples,
): ArchApp =>
  UiScene.appOf(
    set,
    apps.map((spec) => spec.app),
    [
      new ChatGraphProvider({
        apps: apps.map((spec) => ({
          ...spec,
          entryPoints: pointsOf(spec.app),
        })),
        examples,
      }),
    ],
  );

/** Учебный набор: `exampleDialog` на просторном мессенджере и `exampleWindowed` на `capabilities`. */
const exampleScene = (
  capabilities: MessengerCapabilities,
  views: ChatViews = exampleDialogViews,
): ArchApp =>
  sceneOf(
    ExampleUiSetDef,
    [
      {
        app: ExampleDialogUiAppDef,
        views: exampleDialogViews,
        capabilities: EDITING,
      },
      { app: ExampleWindowedUiAppDef, views, capabilities },
    ],
    EXAMPLES,
  );

/** Строки CH-01 приложения `app`. */
const linesOf = (report: ArchReport, app: string): string[] =>
  report
    .rule('CH-01')
    .filter((line) => line.startsWith(`CH-01: приложение ${app}: `));

/** Строки CH-01 приложения `app` об экране или уведомлении `place` (`экран <id>`, `уведомление <id>`). */
const linesAbout = (report: ArchReport, app: string, place: string) =>
  linesOf(report, app).filter((line) => line.includes(`: ${place}, пример `));

/** Карточка из двух сообщений: первое без вариантов, последнее — с вариантами по умолчанию. */
const twoMessagesCard = (first: string, last: string) =>
  exampleDialogViews.over([
    ScreenPresenter.of(TaskCardScreenDef, {
      render: (_view, kit) => [kit.message(first, []), kit.message(last)],
    }),
  ]);

describe('CH-01: текст экрана', () => {
  test('текст экрана длиннее textWithOptions — код 1, строка CH-01 с приложением, экраном, примером и номером сообщения', () => {
    const report = ArchReport.of(
      exampleScene(tight({ textWithOptions: { max: 30, unit: 'codePoint' } })),
    );

    expect(report.code).toBe(1);
    expect(linesAbout(report, WINDOWED, `экран ${LIST}`)).toContainEqual(
      expect.stringMatching(
        /^CH-01: приложение exampleWindowed: экран exampleUi\/todo\/taskList, пример full: сообщение 1 длиннее лимита textWithOptions \(\d+ из 30 codePoint\)$/,
      ),
    );
  });

  test('два приложения в одном графе: тот же пример у приложения с просторными возможностями — нарушения нет', () => {
    const report = ArchReport.of(
      exampleScene(tight({ textWithOptions: { max: 30, unit: 'codePoint' } })),
    );

    expect(linesOf(report, WINDOWED).length).toBeGreaterThan(0);
    expect(linesOf(report, DIALOG)).toEqual([]);
  });
});

describe('CH-01: экран из нескольких сообщений', () => {
  test('первое сообщение длиннее text — нарушение с номером 1, последнее в лимите', () => {
    const report = ArchReport.of(
      exampleScene(
        tight({ text: { max: 10, unit: 'codePoint' } }),
        twoMessagesCard('Первое сообщение карточки', 'Кратко'),
      ),
    );
    const lines = linesOf(report, WINDOWED);

    expect(report.code).toBe(1);
    expect(lines).toHaveLength(2);
    for (const example of ['open', 'done']) {
      expect(lines).toContainEqual(
        expect.stringMatching(
          new RegExp(
            `^CH-01: приложение exampleWindowed: экран exampleUi/todo/taskCard, пример ${example}: сообщение 1 длиннее лимита text \\(\\d+ из 10 codePoint\\)$`,
          ),
        ),
      );
    }
  });

  test('последнее сообщение длиннее textWithOptions при допустимом text — нарушение с номером 2', () => {
    const report = ArchReport.of(
      exampleScene(
        tight({ textWithOptions: { max: 10, unit: 'codePoint' } }),
        twoMessagesCard('Первое', 'Последнее сообщение'),
      ),
    );
    const lines = linesAbout(report, WINDOWED, `экран ${CARD}`);

    expect(report.code).toBe(1);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(
        /^CH-01: приложение exampleWindowed: экран exampleUi\/todo\/taskCard, пример (open|done): сообщение 2 длиннее лимита textWithOptions \(\d+ из 10 codePoint\)$/,
      );
    }
  });
});

describe('CH-01: варианты экрана', () => {
  test('подпись варианта длиннее options.label — нарушение с номером варианта', () => {
    const views = exampleDialogViews.over([
      ScreenPresenter.of(TaskCardScreenDef, {
        render: (_view, kit) =>
          kit.message('Карточка', [
            ...kit.options
              .filter((option) => option.kind !== 'back')
              .slice(0, 1),
            ...kit.options
              .filter((option) => option.kind === 'back')
              .map((option) => ({ ...option, label: 'Назад к списку задач' })),
          ]),
      }),
    ]);

    const report = ArchReport.of(
      exampleScene(tight({ options: labelLimit(10) }), views),
    );
    const lines = linesAbout(report, WINDOWED, `экран ${CARD}`);

    expect(report.code).toBe(1);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(
        /^CH-01: приложение exampleWindowed: экран exampleUi\/todo\/taskCard, пример (open|done): .*вариант 2: подпись длиннее лимита \(\d+ из 10 grapheme\)$/,
      );
    }
  });

  test('вариантов больше options.max — нарушения нет: число вариантов раскладывает беседа', () => {
    const report = ArchReport.of(
      exampleScene(tight({ options: { ...EDITING.options, max: 1 } })),
    );

    expect(linesOf(report, WINDOWED)).toEqual([]);
  });
});

/** Экран-цель ссылки уведомления с длинной подписью. */
const BoardScreenDef = ScreenDef.define({
  name: 'board',
  label: 'Доска объявлений школы',
  description: 'Экран-цель ссылки уведомления.',
  reads: [ListTasksUcDef],
  data: v.object({}),
  examples: {
    plain: {
      label: 'Доска',
      description: 'Пустая доска.',
      params: {},
      data: {},
    },
  },
});

/** Уведомление без ссылок. */
const PingNotificationDef = NotificationDef.define({
  name: 'ping',
  label: 'Напоминание',
  description: 'Уведомление без ссылок.',
  event: TaskEvents.assigned,
  recipients: { from: 'payload', fields: ['assigneeId'] },
  reads: [ListTasksUcDef],
  data: v.object({ title: v.string() }),
  examples: {
    sample: {
      label: 'Напоминание',
      description: 'Напоминание о задаче «Хлеб».',
      data: { title: 'Хлеб' },
    },
  },
});

/** Второй экран-цель ссылок уведомления: подпись короче лимитов сцен. */
const ShelfScreenDef = ScreenDef.define({
  name: 'shelf',
  label: 'Полка',
  description: 'Второй экран-цель ссылки уведомления.',
  reads: [ListTasksUcDef],
  data: v.object({}),
  examples: {
    plain: {
      label: 'Полка',
      description: 'Пустая полка.',
      params: {},
      data: {},
    },
  },
});

/** Уведомление со ссылками на доску и полку. */
const CallNotificationDef = NotificationDef.define({
  name: 'call',
  label: 'Вызов',
  description: 'Уведомление со ссылками на доску и полку.',
  event: TaskEvents.assigned,
  recipients: { from: 'payload', fields: ['assigneeId'] },
  reads: [ListTasksUcDef],
  data: v.object({ title: v.string() }),
  links: () => [BoardScreenDef, ShelfScreenDef],
  examples: {
    sample: {
      label: 'Вызов',
      description: 'Вызов по задаче «Хлеб».',
      data: { title: 'Хлеб' },
    },
  },
});

/** Набор уведомлений со ссылкой и без поверх учебного домена. */
const NoteUiSetDef = UiSetDef.define({
  name: 'noteUi',
  label: 'Набор уведомлений',
  description: 'Уведомления со ссылкой и без.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'desk',
      label: 'Стол',
      description: 'Доска, полка и два уведомления.',
      screens: [BoardScreenDef, ShelfScreenDef],
      stories: [],
      notifications: [PingNotificationDef, CallNotificationDef],
    }),
  ],
});

const NoteAppDef = UiAppDef.define({
  name: 'noteChat',
  label: 'Уведомления в мессенджере',
  description: 'Приложение сцены уведомлений.',
  set: NoteUiSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  notifications: [PingNotificationDef, CallNotificationDef],
  entries: {
    start: {
      label: 'Доска',
      description: 'Доска с начала.',
      address: BoardScreenDef.at({}),
    },
  },
});

class BoardScreenCode extends ScreenCode<typeof BoardScreenDef> {
  override async load() {
    return ok({});
  }
}

class ShelfScreenCode extends ScreenCode<typeof ShelfScreenDef> {
  override async load() {
    return ok({});
  }
}

class PingNotificationCode extends NotificationCode<
  typeof PingNotificationDef
> {
  override async load() {
    return ok({ title: 'Хлеб' });
  }
}

class CallNotificationCode extends NotificationCode<
  typeof CallNotificationDef
> {
  override async load() {
    return ok({ title: 'Хлеб' });
  }
}

const NOTE_EXAMPLES = await ChatExamples.collect({
  set: NoteUiSetDef,
  codes: CodeLoaders.of(NoteUiSetDef, [
    CodeLoader.screen(BoardScreenDef, async () => new BoardScreenCode()),
    CodeLoader.screen(ShelfScreenDef, async () => new ShelfScreenCode()),
    CodeLoader.notification(
      PingNotificationDef,
      async () => new PingNotificationCode(),
    ),
    CodeLoader.notification(
      CallNotificationDef,
      async () => new CallNotificationCode(),
    ),
  ]),
});

const noteViews = ChatViews.of(NoteUiSetDef, [
  ScreenPresenter.for(BoardScreenDef, () => 'Доска'),
  ScreenPresenter.for(ShelfScreenDef, () => 'Полка'),
  NotificationPresenter.for(
    PingNotificationDef,
    ({ title }) => `Напоминание о задаче: ${title}`,
  ),
  NotificationPresenter.for(
    CallNotificationDef,
    ({ title }) => `Вызов: ${title}`,
  ),
]);

const noteReport = (capabilities: MessengerCapabilities) =>
  ArchReport.of(
    sceneOf(
      NoteUiSetDef,
      [{ app: NoteAppDef, views: noteViews, capabilities }],
      NOTE_EXAMPLES,
    ),
  );

describe('CH-01: уведомление', () => {
  test('текст уведомления без ссылок длиннее text — код 1, строка с уведомлением и примером', () => {
    const report = noteReport(tight({ text: { max: 10, unit: 'codePoint' } }));
    const lines = report.rule('CH-01');

    expect(report.code).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^CH-01: приложение noteChat: уведомление noteUi\/desk\/ping, пример sample: текст длиннее лимита text \(\d+ из 10 codePoint\)$/,
    );
  });

  test('текст уведомления со ссылкой меряется по textWithOptions', () => {
    const report = noteReport(
      tight({ textWithOptions: { max: 10, unit: 'codePoint' } }),
    );
    const lines = report.rule('CH-01');

    expect(report.code).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^CH-01: приложение noteChat: уведомление noteUi\/desk\/call, пример sample: текст длиннее лимита textWithOptions \(\d+ из 10 codePoint\)$/,
    );
  });

  test('подпись экрана-цели ссылки длиннее лимита подписи — нарушение со ссылкой на экран', () => {
    const report = noteReport(tight({ options: labelLimit(10) }));
    const lines = report.rule('CH-01');

    expect(report.code).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^CH-01: приложение noteChat: уведомление noteUi\/desk\/call, пример sample: ссылка на noteUi\/desk\/board: подпись длиннее лимита \(\d+ из 10 grapheme\)$/,
    );
  });

  test('ссылок уведомления больше options.max — нарушение с числом ссылок и лимитом: беседа ссылки не раскладывает, лишние отбросит страж', () => {
    const report = noteReport(
      tight({ options: { ...EDITING.options, max: 1 } }),
    );

    expect(report.code).toBe(1);
    expect(report.rule('CH-01')).toEqual([
      'CH-01: приложение noteChat: уведомление noteUi/desk/call, пример sample: ссылок больше лимита (2 из 1)',
    ]);
  });

  test('ссылок уведомления ровно options.max — нарушения нет', () => {
    const report = noteReport(
      tight({ options: { ...EDITING.options, max: 2 } }),
    );

    expect(report.rule('CH-01')).toEqual([]);
  });
});

describe('CH-01: представление не собрало показ', () => {
  test('представление экрана бросило — строка CH-01 без данных вида и текста броска', () => {
    const views = exampleDialogViews.over([
      ScreenPresenter.of(TaskCardScreenDef, {
        render: ({ data }) => {
          throw new Error(`секрет представления ${data?.title}`);
        },
      }),
    ]);

    const report = ArchReport.of(exampleScene(EDITING, views));

    expect(report.code).toBe(1);
    expect(linesOf(report, WINDOWED).sort()).toEqual([
      'CH-01: приложение exampleWindowed: экран exampleUi/todo/taskCard, пример done: представление не собрало показ',
      'CH-01: приложение exampleWindowed: экран exampleUi/todo/taskCard, пример open: представление не собрало показ',
    ]);
    expect(linesOf(report, DIALOG)).toEqual([]);
  });

  test('вывод не по правилам сборщика показа (вариант не из вариантов по умолчанию) — та же строка CH-01', () => {
    const views = exampleDialogViews.over([
      ScreenPresenter.of(TaskCardScreenDef, {
        render: (_view, kit) =>
          kit.message('Карточка', [
            { kind: 'local', name: 'чужой', label: 'Чужой' },
          ]),
      }),
    ]);

    const report = ArchReport.of(exampleScene(EDITING, views));

    expect(linesOf(report, WINDOWED)).toHaveLength(2);
    for (const line of linesOf(report, WINDOWED)) {
      expect(line).toMatch(
        /^CH-01: приложение exampleWindowed: экран exampleUi\/todo\/taskCard, пример (open|done): представление не собрало показ$/,
      );
    }
  });

  test('представление уведомления бросило — строка CH-01 без данных и текста броска', () => {
    const views = exampleDialogViews.over([
      NotificationPresenter.for(TaskAssignedNotificationDef, ({ title }) => {
        throw new Error(`секрет уведомления ${title}`);
      }),
    ]);

    const report = ArchReport.of(exampleScene(EDITING, views));

    expect(report.code).toBe(1);
    expect(linesOf(report, WINDOWED)).toEqual([
      'CH-01: приложение exampleWindowed: уведомление exampleUi/todo/taskAssigned, пример sample: представление не собрало показ',
    ]);
  });
});

describe('CH-01: тексты нарушений без данных (ERR-07)', () => {
  test('текст нарушения не содержит текста примера и данных вида', () => {
    const report = ArchReport.of(
      exampleScene(
        tight({
          text: { max: 3, unit: 'codePoint' },
          textWithOptions: { max: 3, unit: 'codePoint' },
          options: labelLimit(1),
        }),
      ),
    );
    const lines = linesOf(report, WINDOWED);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const text of EXAMPLE_TEXTS) {
        expect(line).not.toContain(text);
      }
    }
  });
});

describe('CH-01: граница с другими правилами', () => {
  test('экран без представления — CH-01 молчит, нарушение даёт UI-06', () => {
    const views = ChatViews.of(ExampleUiSetDef, [
      TaskListView,
      AssignedTasksView,
      UserCardView,
      MainMenuView,
      TaskAssignedView,
      TaskCompletedView,
    ]);

    const report = ArchReport.of(
      sceneOf(
        ExampleUiSetDef,
        [{ app: ExampleDialogUiAppDef, views, capabilities: EDITING }],
        EXAMPLES,
      ),
    );

    expect(report.rule('UI-06')).toHaveLength(1);
    expect(report.rule('CH-01')).toEqual([]);
  });

  test('свойства chatMessenger не по схеме — check не бросает: строка о возможностях у сломанного приложения, мера его примеров не идёт, у второго приложения строк нет', () => {
    const scene = exampleScene(
      tight({ textWithOptions: { max: 30, unit: 'codePoint' } }),
    );
    const provider = (scene.providers ?? []).find(
      (item) => item instanceof ChatGraphProvider,
    );
    const rule = provider?.rules?.().find((item) => item.id === 'CH-01');
    const built = new AppGraph(scene).build();
    // Сборщик графа проверяет свойства схемой вида и узел не по схеме не
    // пропустит: сцена собирает граф конструктором `Graph` в обход него,
    // как граф с чужими правками. Другого пути к такому графу нет.
    const broken = new Graph({
      providers: built.providers,
      nodes: built
        .nodes()
        .map((node) =>
          node.kind === 'chatMessenger' && node.parent === WINDOWED
            ? { ...node, props: { name: 'сломанный' } }
            : node,
        ),
      edges: built.edges(),
    });

    expect(rule).toBeDefined();
    expect(rule?.check(built).length).toBeGreaterThan(0);
    let lines: readonly string[] = [];
    expect(() => {
      lines = rule?.check(broken) ?? [];
    }).not.toThrow();
    expect(lines).toEqual([
      'приложение exampleWindowed: возможности мессенджера не по схеме',
    ]);
  });

  test('ребро presents другого поставщика на цель без представления в реестре приложения — CH-01 молчит: это не дефект представления', () => {
    const views = ChatViews.of(ExampleUiSetDef, [
      TaskListView,
      AssignedTasksView,
      TaskCompletedView,
    ]);
    const scene = exampleScene(EDITING, views);
    const stub: GraphProvider = {
      name: 'scene-presents',
      version: '1.0.0',
      kinds: () => ({ nodes: [], edges: [] }),
      contribute: () => ({
        nodes: [],
        edges: [CARD, 'exampleUi/todo/taskAssigned'].map((to) => ({
          kind: 'presents',
          from: WINDOWED,
          to,
        })),
      }),
    };

    const withStub = {
      ...scene,
      providers: [...(scene.providers ?? []), stub],
    };

    expect(
      new AppGraph(withStub)
        .build()
        .outgoing(WINDOWED, 'presents')
        .map((edge) => edge.to),
    ).toContain(CARD);
    expect(ArchReport.of(withStub).rule('CH-01')).toEqual([]);
  });
});
