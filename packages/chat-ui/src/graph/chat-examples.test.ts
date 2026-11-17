import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
import { ExampleArch } from 'dmg-core/testing';
import {
  ExampleAppDef,
  ListTasksUcDef,
  TaskEvents,
} from 'dmg-core/testing/example';
import {
  CodeLoader,
  CodeLoaders,
  NotificationCode,
  NotificationDef,
  type RenderContext,
  ScreenCode,
  ScreenDef,
  ScreenPreview,
  UiAppDef,
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import { UiGraphProvider } from 'dmg-ui/graph';
import {
  ExampleUiSetDef,
  exampleCodes,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import { ArchReport } from 'dmg-ui/testing/fixtures';
import * as v from 'valibot';
import { MemoryMessenger } from '../../testing';
import { DIALOG_CHANNEL } from '../dialog';
import type { MessengerCapabilities } from '../messenger/messenger.types';
import { ChatViews } from '../view/chat-views';
import { NotificationPresenter } from '../view/notification-presenter';
import { ScreenPresenter } from '../view/screen-presenter';
import { ChatExamples } from './chat-examples';
import { ChatGraphProvider } from './chat-graph-provider';

// Примеры для правила лимитов собираются до графа: `check` правила
// синхронный, а вид экрана по примеру — `Promise` (код экрана грузится
// `import()`). Пример не по схеме пропускается — нарушение даёт UI-20.

const LIST = 'exampleUi/todo/taskList';
const CARD = 'exampleUi/todo/taskCard';
const ASSIGNED = 'exampleUi/todo/assignedTasks';

/** Контекст по умолчанию — как у помощника рендера примеров ядра. */
const DEFAULT_CONTEXT: RenderContext = {
  locale: 'ru-RU',
  timeZone: 'Asia/Oral',
  delegate: false,
  readOnly: false,
};

const collectExample = (context?: RenderContext) =>
  ChatExamples.collect({
    set: ExampleUiSetDef,
    codes: exampleCodes(),
    ...(context === undefined ? {} : { context }),
  });

/** Бросок вызова (синхронный или отказ промиса); не бросил — `undefined`. */
const thrown = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return undefined;
};

/** Поле числа с описанием — как требует граф ядра у `params` и `state`. */
const count = (text: string) => v.pipe(v.number(), v.description(text));

/** Экран с примером по схеме и примерами не по схеме `data`, `params`, `state`. */
const ProbeScreenDef = ScreenDef.define({
  name: 'probe',
  label: 'Проба',
  description: 'Экран с примерами не по схеме.',
  reads: [ListTasksUcDef],
  params: v.strictObject({ page: count('Страница') }),
  data: v.object({ title: v.string() }),
  state: v.strictObject({ step: count('Шаг') }),
  examples: {
    good: {
      label: 'По схеме',
      description: 'Параметры, данные и состояние проходят схемы.',
      params: { page: 1 },
      data: { title: 'Хлеб' },
      state: { step: 1 },
    },
    bad: {
      label: 'Не по схеме',
      description: 'Поле title — не строка.',
      params: { page: 1 },
      data: { title: 4242 },
      state: { step: 1 },
    },
    badParams: {
      label: 'Параметры не по схеме',
      description: 'Поле page — не число.',
      params: { page: 'первая' },
      data: { title: 'Хлеб' },
      state: { step: 1 },
    },
    badState: {
      label: 'Состояние не по схеме',
      description: 'Поле step — не число.',
      params: { page: 1 },
      data: { title: 'Хлеб' },
      state: { step: 'первый' },
    },
  },
});

/** Уведомление с примером по схеме и примером не по схеме. */
const ProbeNotificationDef = NotificationDef.define({
  name: 'ping',
  label: 'Проба уведомления',
  description: 'Уведомление с одним примером не по схеме.',
  event: TaskEvents.assigned,
  recipients: { from: 'payload', fields: ['assigneeId'] },
  reads: [ListTasksUcDef],
  data: v.object({ title: v.string() }),
  examples: {
    good: {
      label: 'По схеме',
      description: 'Данные проходят схему.',
      data: { title: 'Молоко' },
    },
    bad: {
      label: 'Не по схеме',
      description: 'Поле title — не строка.',
      data: { title: 4242 },
    },
  },
});

/** Набор с примерами не по схеме поверх учебного домена. */
const ProbeUiSetDef = UiSetDef.define({
  name: 'probeUi',
  label: 'Набор проб',
  description: 'Набор с примерами не по схеме.',
  app: ExampleAppDef,
  modules: [
    UiModuleDef.define({
      name: 'desk',
      label: 'Стол',
      description: 'Экран и уведомление проб.',
      screens: [ProbeScreenDef],
      stories: [],
      notifications: [ProbeNotificationDef],
    }),
  ],
});

class ProbeScreenCode extends ScreenCode<typeof ProbeScreenDef> {
  override async load() {
    return ok({ title: 'из load' });
  }

  override initialState() {
    return { step: 1 };
  }
}

class ProbeNotificationCode extends NotificationCode<
  typeof ProbeNotificationDef
> {
  override async load() {
    return ok({ title: 'из load' });
  }
}

const probeCodes = () =>
  CodeLoaders.of(ProbeUiSetDef, [
    CodeLoader.screen(ProbeScreenDef, async () => new ProbeScreenCode()),
    CodeLoader.notification(
      ProbeNotificationDef,
      async () => new ProbeNotificationCode(),
    ),
  ]);

describe('ChatExamples.collect — примеры набора', () => {
  test('collect собирает виды всех примеров экранов набора: id экрана, имя примера, вид ready', async () => {
    const examples = await collectExample();
    const screens = examples.screens();

    expect(examples.set).toBe(ExampleUiSetDef);
    expect(screens.map(({ id, name }) => `${id} ${name}`).sort()).toEqual([
      `${ASSIGNED} two`,
      `${CARD} done`,
      `${CARD} open`,
      `${LIST} empty`,
      `${LIST} full`,
    ]);
    for (const { id, view } of screens) {
      expect(view.screen).toBe(id);
      expect(view.status).toBe('ready');
    }
    expect(
      screens.find(({ id, name }) => id === LIST && name === 'full')?.view.data,
    ).toEqual(TaskListScreenDef.examples.full?.data);
  });

  test('collect собирает данные всех примеров уведомлений набора', async () => {
    const examples = await collectExample();
    const notifications = [...examples.notifications()].sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    expect(notifications).toEqual([
      {
        id: 'exampleUi/todo/taskAssigned',
        name: 'sample',
        data: TaskAssignedNotificationDef.examples.sample?.data,
      },
      {
        id: 'exampleUi/todo/taskCompleted',
        name: 'sample',
        data: TaskCompletedNotificationDef.examples.sample?.data,
      },
    ]);
  });

  test('контекст по умолчанию — ru-RU, Asia/Oral, без заместителя и без «только чтение»', async () => {
    const examples = await collectExample();

    for (const { view } of examples.screens()) {
      expect(view.context).toEqual(DEFAULT_CONTEXT);
    }
  });

  test('свой контекст рендера — в видах всех примеров', async () => {
    const context: RenderContext = {
      locale: 'en-US',
      timeZone: 'UTC',
      delegate: true,
      readOnly: true,
    };

    const examples = await collectExample(context);

    expect(examples.screens()).toHaveLength(5);
    for (const { view } of examples.screens()) {
      expect(view.context).toEqual(context);
    }
  });
});

describe('ChatExamples.collect — примеры не по схеме и чужие загрузчики', () => {
  test('примеры не по схеме data, params и state пропущены, не бросок: у экрана и уведомления остаются примеры по схеме', async () => {
    const examples = await ChatExamples.collect({
      set: ProbeUiSetDef,
      codes: probeCodes(),
    });

    expect(examples.set).toBe(ProbeUiSetDef);
    expect(examples.screens().map(({ id, name }) => `${id} ${name}`)).toEqual([
      'probeUi/desk/probe good',
    ]);
    expect(examples.notifications()).toEqual([
      { id: 'probeUi/desk/ping', name: 'good', data: { title: 'Молоко' } },
    ]);
  });

  test('загрузчики кода другого набора — бросок с именами обоих наборов', async () => {
    const error = await thrown(() =>
      ChatExamples.collect({ set: ExampleUiSetDef, codes: probeCodes() }),
    );

    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain('probeUi');
    expect(String(error)).toContain('exampleUi');
  });
});

describe('ChatExamples.collect — отсев сходится с превью ядра', () => {
  test('пример, оставленный collect, превью ядра собирает; отсеянный — превью бросает', async () => {
    const examples = await ChatExamples.collect({
      set: ProbeUiSetDef,
      codes: probeCodes(),
    });
    const preview = new ScreenPreview({
      set: ProbeUiSetDef,
      codes: probeCodes(),
    });
    const kept = new Set([
      ...examples.screens().map(({ name }) => `screen ${name}`),
      ...examples.notifications().map(({ name }) => `notification ${name}`),
    ]);
    const outcomes = [
      ...(await Promise.all(
        Object.keys(ProbeScreenDef.examples).map(async (name) => ({
          name: `screen ${name}`,
          error: await thrown(() =>
            preview.screen(ProbeScreenDef, name, DEFAULT_CONTEXT),
          ),
        })),
      )),
      ...(await Promise.all(
        Object.keys(ProbeNotificationDef.examples).map(async (name) => ({
          name: `notification ${name}`,
          error: await thrown(() =>
            preview.notification(ProbeNotificationDef, name),
          ),
        })),
      )),
    ];

    expect(outcomes).toHaveLength(6);
    for (const { name, error } of outcomes) {
      expect({ name, previewed: error === undefined }).toEqual({
        name,
        previewed: kept.has(name),
      });
    }
  });
});

/** Приложение мессенджера на наборе проб. */
const ProbeAppDef = UiAppDef.define({
  name: 'probeChat',
  label: 'Пробы в мессенджере',
  description: 'Приложение сцены отсева примеров.',
  set: ProbeUiSetDef,
  channel: DIALOG_CHANNEL,
  stories: [],
  notifications: [ProbeNotificationDef],
  entries: {
    start: {
      label: 'Проба',
      description: 'Проба с начала.',
      address: ProbeScreenDef.at({ page: 1 }),
    },
  },
});

describe('ChatExamples.collect — граница с UI-20', () => {
  test('пропущенный пример даёт строку UI-20, CH-01 о нём молчит, а пример по схеме меряет', async () => {
    const examples = await ChatExamples.collect({
      set: ProbeUiSetDef,
      codes: probeCodes(),
    });
    const views = ChatViews.of(ProbeUiSetDef, [
      ScreenPresenter.for(ProbeScreenDef, () => 'Проба экрана'),
      NotificationPresenter.for(
        ProbeNotificationDef,
        ({ title }) => `Проба уведомления: ${title}`,
      ),
    ]);
    const capabilities: MessengerCapabilities = {
      ...MemoryMessenger.editing().capabilities,
      text: { max: 3, unit: 'codePoint' },
      textWithOptions: { max: 3, unit: 'codePoint' },
    };

    const report = ArchReport.of({
      ...ExampleArch,
      providers: [
        new UiGraphProvider({ set: ProbeUiSetDef, apps: [ProbeAppDef] }),
        new ChatGraphProvider({
          apps: [
            {
              app: ProbeAppDef,
              views,
              capabilities,
              entryPoints: [{ entry: 'start', via: 'message', key: 'start' }],
            },
          ],
          examples,
        }),
      ],
    });
    const ch01 = report.rule('CH-01');

    expect(
      report
        .rule('UI-20')
        .map((line) => line.replace(/( не по схеме \w+): .*$/, '$1'))
        .sort(),
    ).toEqual([
      'UI-20: probeUi/desk/ping: пример bad не по схеме data',
      'UI-20: probeUi/desk/probe: пример bad не по схеме data',
      'UI-20: probeUi/desk/probe: пример badParams не по схеме params',
      'UI-20: probeUi/desk/probe: пример badState не по схеме state',
    ]);
    expect(ch01.length).toBeGreaterThan(0);
    expect(ch01.filter((line) => line.includes(', пример good: '))).toEqual(
      ch01,
    );
  });
});
