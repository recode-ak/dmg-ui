import { describe, expect, test } from 'bun:test';
import { ok } from 'dmg-core';
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
  UiModuleDef,
  UiSetDef,
} from 'dmg-ui';
import {
  ExampleUiSetDef,
  exampleCodes,
  TaskAssignedNotificationDef,
  TaskCompletedNotificationDef,
  TaskListScreenDef,
} from 'dmg-ui/testing';
import * as v from 'valibot';
import { ChatExamples } from './chat-examples';

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

/** Экран с примером по схеме и примером с данными не по схеме. */
const ProbeScreenDef = ScreenDef.define({
  name: 'probe',
  label: 'Проба',
  description: 'Экран с одним примером не по схеме.',
  reads: [ListTasksUcDef],
  data: v.object({ title: v.string() }),
  examples: {
    good: {
      label: 'По схеме',
      description: 'Данные проходят схему.',
      params: {},
      data: { title: 'Хлеб' },
    },
    bad: {
      label: 'Не по схеме',
      description: 'Поле title — не строка.',
      params: {},
      data: { title: 4242 },
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
  test('пример не по схеме пропущен, не бросок: у экрана и уведомления остаются примеры по схеме', async () => {
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
