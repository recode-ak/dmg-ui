import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import {
  ExampleAppDef,
  ListTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import {
  AppCodeLoaders,
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
  AppChatViews,
  ChatViews,
  DIALOG_CHANNEL,
  type MessengerCapabilities,
  NotificationPresenter,
  ScreenPresenter,
} from 'dmg-ui/chat-ui';
import {
  ExampleUiSetDef,
  ExampleWindowedUiAppDef,
  exampleCodes,
  exampleDialogViews,
  TaskAssignedNotificationDef,
  TaskCardScreenDef,
  todoChatViews,
} from 'dmg-ui/example';
import * as v from 'valibot';
import { ChatExamples, ExampleLimits, MemoryMessenger } from '../index';

// CH-01: пример экрана и уведомления укладывается в лимиты мессенджера.
// Тест собирает примеры набора один раз и вызывает `check` на паре «сборка
// представлений × возможности»; меряются экраны и уведомления модулей
// сборки. Экран — как показ с «Назад» (худший случай): последнее сообщение —
// по `textWithOptions`, остальные — по `text`, подписи вариантов — по
// `options.label`; число вариантов не нарушение. Уведомление: без ссылок —
// `text`, со ссылками — `textWithOptions`, подпись ссылки — `label`
// экрана-цели из Def, число ссылок — по `options.max` (беседа ссылки не
// раскладывает).

const EDITING = MemoryMessenger.editing().capabilities;

const LIST = 'exampleUi/todo/taskList';
const CARD = 'exampleUi/todo/taskCard';
const USER = 'exampleUi/users/userCard';

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

/** Просторные возможности с урезанными полями — подставной мессенджер теста. */
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

/** Тесные лимиты текста и подписи: нарушения у каждого примера. */
const CRAMPED = tight({
  text: { max: 3, unit: 'codePoint' },
  textWithOptions: { max: 3, unit: 'codePoint' },
  options: labelLimit(1),
});

const EXAMPLES = await ChatExamples.collect({
  set: ExampleUiSetDef,
  codes: exampleCodes(),
});

const limits = new ExampleLimits(EXAMPLES);

/** Сборка приложения `exampleWindowed`: его модуль — только `todo`, реестр `users` вне приложения. */
const windowed = (todo: ChatViews = todoChatViews) =>
  AppChatViews.of(ExampleWindowedUiAppDef, [todo]);

/** Строки CH-01 об экране или уведомлении `place` (`экран <id>`, `уведомление <id>`). */
const about = (lines: readonly string[], place: string) =>
  lines.filter((line) => line.includes(`: ${place}, пример `));

/** Карточка из двух сообщений: первое без вариантов, последнее — с вариантами по умолчанию. */
const twoMessagesCard = (first: string, last: string) =>
  windowed(
    todoChatViews.over([
      ScreenPresenter.of(TaskCardScreenDef, {
        render: (_view, kit) => [kit.message(first, []), kit.message(last)],
      }),
    ]),
  );

describe('CH-01: текст экрана', () => {
  test('текст экрана длиннее textWithOptions — строка CH-01 с приложением, экраном, примером и номером сообщения', () => {
    const lines = limits.check(
      windowed(),
      tight({ textWithOptions: { max: 30, unit: 'codePoint' } }),
    );

    expect(limits.id).toBe('CH-01');
    expect(about(lines, `экран ${LIST}`)).toContainEqual(
      expect.stringMatching(
        /^CH-01: приложение exampleWindowed: экран exampleUi\/todo\/taskList, пример full: сообщение 1 длиннее лимита textWithOptions \(\d+ из 30 codePoint\)$/,
      ),
    );
  });

  test('та же сборка на просторных возможностях — нарушений нет', () => {
    const views = windowed();

    expect(
      limits.check(
        views,
        tight({ textWithOptions: { max: 30, unit: 'codePoint' } }),
      ).length,
    ).toBeGreaterThan(0);
    expect(limits.check(views, EDITING)).toEqual([]);
  });
});

describe('CH-01: экран из нескольких сообщений', () => {
  test('первое сообщение длиннее text — нарушение с номером 1, последнее в лимите', () => {
    const lines = limits.check(
      twoMessagesCard('Первое сообщение карточки', 'Кратко'),
      tight({ text: { max: 10, unit: 'codePoint' } }),
    );

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
    const lines = about(
      limits.check(
        twoMessagesCard('Первое', 'Последнее сообщение'),
        tight({ textWithOptions: { max: 10, unit: 'codePoint' } }),
      ),
      `экран ${CARD}`,
    );

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
    const views = windowed(
      todoChatViews.over([
        ScreenPresenter.of(TaskCardScreenDef, {
          render: (_view, kit) =>
            kit.message('Карточка', [
              ...kit.options
                .filter((option) => option.kind !== 'back')
                .slice(0, 1),
              ...kit.options
                .filter((option) => option.kind === 'back')
                .map((option) => ({
                  ...option,
                  label: 'Назад к списку задач',
                })),
            ]),
        }),
      ]),
    );

    const lines = about(
      limits.check(views, tight({ options: labelLimit(10) })),
      `экран ${CARD}`,
    );

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(
        /^CH-01: приложение exampleWindowed: экран exampleUi\/todo\/taskCard, пример (open|done): .*вариант 2: подпись длиннее лимита \(\d+ из 10 grapheme\)$/,
      );
    }
  });

  test('вариантов больше options.max — нарушения нет: число вариантов раскладывает беседа', () => {
    expect(
      limits.check(
        windowed(),
        tight({ options: { ...EDITING.options, max: 1 } }),
      ),
    ).toEqual([]);
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

/** Второй экран-цель ссылок уведомления: подпись короче лимитов теста. */
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
const NoteUiModuleDef = UiModuleDef.define({
  name: 'desk',
  label: 'Стол',
  description: 'Доска, полка и два уведомления.',
  screens: [BoardScreenDef, ShelfScreenDef],
  stories: [],
  notifications: [PingNotificationDef, CallNotificationDef],
});

const NoteUiSetDef = UiSetDef.define({
  name: 'noteUi',
  label: 'Набор уведомлений',
  description: 'Уведомления со ссылкой и без.',
  app: ExampleAppDef,
  modules: [NoteUiModuleDef],
});

const NoteAppDef = UiAppDef.define({
  name: 'noteChat',
  label: 'Уведомления в мессенджере',
  description: 'Приложение уведомлений теста.',
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
  codes: AppCodeLoaders.ofSet(NoteUiSetDef, [
    CodeLoaders.of(NoteUiModuleDef, [
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
  ]),
});

/** Сборка приложения `noteChat`: подписи ссылок уведомления — `label` экранов-целей из Def. */
const noteViews = AppChatViews.of(NoteAppDef, [
  ChatViews.of(NoteUiModuleDef, [
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
  ]),
]);

const noteLines = (capabilities: MessengerCapabilities) =>
  new ExampleLimits(NOTE_EXAMPLES).check(noteViews, capabilities);

describe('CH-01: уведомление', () => {
  test('текст уведомления без ссылок длиннее text — строка с уведомлением и примером', () => {
    const lines = noteLines(tight({ text: { max: 10, unit: 'codePoint' } }));

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^CH-01: приложение noteChat: уведомление noteUi\/desk\/ping, пример sample: текст длиннее лимита text \(\d+ из 10 codePoint\)$/,
    );
  });

  test('текст уведомления со ссылкой меряется по textWithOptions', () => {
    const lines = noteLines(
      tight({ textWithOptions: { max: 10, unit: 'codePoint' } }),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^CH-01: приложение noteChat: уведомление noteUi\/desk\/call, пример sample: текст длиннее лимита textWithOptions \(\d+ из 10 codePoint\)$/,
    );
  });

  test('подпись экрана-цели ссылки длиннее лимита подписи — нарушение со ссылкой на экран, длина — label экрана из Def', () => {
    const lines = noteLines(tight({ options: labelLimit(10) }));

    expect(lines).toEqual([
      'CH-01: приложение noteChat: уведомление noteUi/desk/call, пример sample: ссылка на noteUi/desk/board: подпись длиннее лимита (22 из 10 grapheme)',
    ]);
  });

  test('ссылок уведомления больше options.max — нарушение с числом ссылок и лимитом: беседа ссылки не раскладывает, лишние отбросит страж', () => {
    expect(
      noteLines(tight({ options: { ...EDITING.options, max: 1 } })),
    ).toEqual([
      'CH-01: приложение noteChat: уведомление noteUi/desk/call, пример sample: ссылок больше лимита (2 из 1)',
    ]);
  });

  test('ссылок уведомления ровно options.max — нарушения нет', () => {
    expect(
      noteLines(tight({ options: { ...EDITING.options, max: 2 } })),
    ).toEqual([]);
  });
});

describe('CH-01: представление не собрало показ', () => {
  test('представление экрана бросило — строка CH-01 без данных вида и текста броска', () => {
    const views = windowed(
      todoChatViews.over([
        ScreenPresenter.of(TaskCardScreenDef, {
          render: ({ data }) => {
            throw new Error(`секрет представления ${data?.title}`);
          },
        }),
      ]),
    );

    expect([...limits.check(views, EDITING)].sort()).toEqual([
      'CH-01: приложение exampleWindowed: экран exampleUi/todo/taskCard, пример done: представление не собрало показ',
      'CH-01: приложение exampleWindowed: экран exampleUi/todo/taskCard, пример open: представление не собрало показ',
    ]);
  });

  test('вывод не по правилам сборщика показа (вариант не из вариантов по умолчанию) — та же строка CH-01', () => {
    const views = windowed(
      todoChatViews.over([
        ScreenPresenter.of(TaskCardScreenDef, {
          render: (_view, kit) =>
            kit.message('Карточка', [
              { kind: 'local', name: 'чужой', label: 'Чужой' },
            ]),
        }),
      ]),
    );

    const lines = limits.check(views, EDITING);

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).toMatch(
        /^CH-01: приложение exampleWindowed: экран exampleUi\/todo\/taskCard, пример (open|done): представление не собрало показ$/,
      );
    }
  });

  test('представление уведомления бросило — строка CH-01 без данных и текста броска', () => {
    const views = windowed(
      todoChatViews.over([
        NotificationPresenter.for(TaskAssignedNotificationDef, ({ title }) => {
          throw new Error(`секрет уведомления ${title}`);
        }),
      ]),
    );

    expect(limits.check(views, EDITING)).toEqual([
      'CH-01: приложение exampleWindowed: уведомление exampleUi/todo/taskAssigned, пример sample: представление не собрало показ',
    ]);
  });
});

describe('CH-01: тексты нарушений без данных (ERR-07)', () => {
  test('текст нарушения не содержит текста примера и данных вида', () => {
    const lines = limits.check(windowed(), CRAMPED);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const text of EXAMPLE_TEXTS) {
        expect(line).not.toContain(text);
      }
    }
  });
});

/** Экран вне учебного набора — для примеров другого набора. */
const StrayScreenDef = ScreenDef.define({
  name: 'stray',
  label: 'Чужой',
  description: 'Экран вне учебного набора.',
  reads: [],
  data: v.object({}),
});

class StrayScreenCode extends ScreenCode<typeof StrayScreenDef> {
  override async load() {
    return ok({});
  }
}

/** Другой набор UI поверх учебного домена. */
const OtherUiModuleDef = UiModuleDef.define({
  name: 'desk',
  label: 'Стол',
  description: 'Один экран.',
  screens: [StrayScreenDef],
  stories: [],
});

const OtherSetDef = UiSetDef.define({
  name: 'otherUi',
  label: 'Другой набор',
  description: 'Набор, которого нет у сборок учебного примера.',
  app: ExampleAppDef,
  modules: [OtherUiModuleDef],
});

/** Текст броска вызова; не бросил — пустая строка. */
const thrown = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
};

describe('CH-01: область сборки и броски', () => {
  test('возможности мессенджера не по схеме (options.max: 0) — бросок без значений возможностей', () => {
    const broken: MessengerCapabilities = {
      ...EDITING,
      options: { ...EDITING.options, max: 0 },
    };

    const message = thrown(() => limits.check(windowed(), broken));

    expect(message).toBe('ExampleLimits: возможности мессенджера не по схеме');
  });

  test('модуль вне сборки не меряется: сборка exampleWindowed без users на тесных лимитах — строк об exampleUi/users/userCard нет', () => {
    const app = limits.check(windowed(), CRAMPED);
    const set = limits.check(exampleDialogViews(), CRAMPED);

    expect(app.length).toBeGreaterThan(0);
    expect(about(app, `экран ${USER}`)).toEqual([]);
    expect(about(set, `экран ${USER}`).length).toBeGreaterThan(0);
  });

  test('примеры другого набора, чем сборка, — бросок с именами обоих наборов', async () => {
    const examples = await ChatExamples.collect({
      set: OtherSetDef,
      codes: AppCodeLoaders.ofSet(OtherSetDef, [
        CodeLoaders.of(OtherUiModuleDef, [
          CodeLoader.screen(StrayScreenDef, async () => new StrayScreenCode()),
        ]),
      ]),
    });

    const message = thrown(() =>
      new ExampleLimits(examples).check(exampleDialogViews(), EDITING),
    );

    expect(message).toBe(
      'ExampleLimits: примеры набора otherUi, а представления — набора exampleUi',
    );
  });

  test('сборка набора — область «набор exampleUi» в строке CH-01', () => {
    const lines = limits.check(
      exampleDialogViews(),
      tight({ textWithOptions: { max: 30, unit: 'codePoint' } }),
    );

    expect(lines).toContainEqual(
      expect.stringMatching(
        /^CH-01: набор exampleUi: экран exampleUi\/todo\/taskList, пример full: сообщение 1 длиннее лимита textWithOptions \(\d+ из 30 codePoint\)$/,
      ),
    );
    for (const line of lines) {
      expect(line.startsWith('CH-01: набор exampleUi: ')).toBe(true);
    }
  });
});
