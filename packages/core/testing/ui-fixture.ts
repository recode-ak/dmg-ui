import { F } from 'dmg-core';
import {
  CompleteTaskUcDef,
  CreateTaskUcDef,
  ExampleAppDef,
  ListTasksUcDef,
  TaskErrors,
  TaskEvents,
} from 'dmg-core/testing/example';
import * as v from 'valibot';
import { NotificationDef } from '../src/manifest/notification-def';
import { type AnyScreenDef, ScreenDef } from '../src/manifest/screen-def';
import { StoryDef } from '../src/manifest/story-def';
import { UiAppDef } from '../src/manifest/ui-app-def';
import { UiModuleDef } from '../src/manifest/ui-module-def';
import { UiSetDef } from '../src/manifest/ui-set-def';

// Манифесты UI поверх учебного приложения `dmg-core` — фикстура тестов ядра
// (Т-18, до Ф5 не экспортируется). Код экранов — `ui-fixture-code.ts`: эта
// фикстура не тянет `screen/`. Взаимные thunk `to` аннотированы: без типа
// возврата TS выводит `any` для обоих экранов (TS7022, цикл вывода).

export const TASK_A = '5e3d1c2b-7a6f-4e8d-b9c0-a1f2e3d4c5b6';
export const TASK_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const OWNER = '1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';

const taskRow = v.object({
  uuid: F.uuid('задачи'),
  title: v.pipe(v.string(), v.description('Название задачи')),
  status: v.picklist(['open', 'done']),
});

/** Список задач: состояние, локальное действие, выходы, перечитывание, примеры. */
export const TaskListScreenDef = ScreenDef.define({
  name: 'taskList',
  label: 'Мои задачи',
  description: 'Список задач вызывающего с выбором для выполнения.',
  params: v.strictObject({
    index: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.description('Смещение в списке'),
    ),
  }),
  reads: [ListTasksUcDef],
  data: v.object({
    tasks: v.array(taskRow),
    hasMore: v.boolean(),
    marked: v.array(F.uuid('отмеченной задачи')),
  }),
  state: v.strictObject({ selected: v.array(v.string()) }),
  actions: {
    open: {
      label: 'Открыть задачу',
      description: 'Карточка выбранной задачи.',
      input: v.object({ taskId: F.uuid('задачи') }),
      to: (): readonly AnyScreenDef[] => [TaskCardScreenDef],
    },
    create: {
      label: 'Создать задачу',
      description: 'Новая задача в списке.',
      visible: true,
      input: v.object({
        title: v.pipe(
          v.string(),
          v.nonEmpty('Название не может быть пустым'),
          v.description('Название задачи'),
        ),
      }),
      uc: CreateTaskUcDef,
    },
    completeSelected: {
      label: 'Выполнить выбранные',
      description: 'Отмечает выбранные задачи выполненными.',
      uc: CompleteTaskUcDef,
      confirm: {
        label: 'Выполнить выбранные задачи?',
        description: 'Выполненную задачу нельзя вернуть в работу.',
      },
    },
    next: {
      label: 'Дальше',
      description: 'Следующая часть списка.',
    },
  },
  locals: {
    toggle: {
      label: 'Отметить задачу',
      description: 'Добавляет задачу в выбор или убирает из него.',
      input: v.object({ taskId: F.uuid('задачи') }),
    },
  },
  primary: 'create',
  exits: {
    created: {
      label: 'Задача создана',
      description: 'Создание задачи завершило сторис.',
      data: v.object({ taskId: F.uuid('задачи') }),
    },
    closed: {
      label: 'Список закрыт',
      description: 'Пользователь закрыл список.',
    },
  },
  refresh: [
    { event: TaskEvents.created, subject: 'ownerId' },
    { event: TaskEvents.archived, any: true },
  ],
  catches: [TaskErrors.TOO_MANY_OPEN],
  examples: {
    empty: {
      label: 'Пустой список',
      description: 'Задач ещё нет.',
      params: { index: 0 },
      data: { tasks: [], hasMore: false, marked: [] },
      state: { selected: [] },
    },
    full: {
      label: 'Список с выбором',
      description: 'Две задачи, одна выбрана.',
      params: { index: 0 },
      data: {
        tasks: [
          { uuid: TASK_A, title: 'Хлеб', status: 'open' },
          { uuid: TASK_B, title: 'Молоко', status: 'done' },
        ],
        hasMore: true,
        marked: [TASK_A],
      },
      state: { selected: [TASK_A] },
    },
  },
});

/** Карточка задачи: ссылается на список, перечитывается по своей задаче. */
export const TaskCardScreenDef = ScreenDef.define({
  name: 'taskCard',
  label: 'Задача',
  description: 'Карточка одной задачи.',
  params: v.strictObject({ taskId: F.uuid('задачи') }),
  reads: [ListTasksUcDef],
  data: taskRow,
  actions: {
    back: {
      label: 'К списку',
      description: 'Возврат к списку задач.',
      to: (): readonly AnyScreenDef[] => [TaskListScreenDef],
    },
    complete: {
      label: 'Выполнить',
      description: 'Отмечает задачу выполненной.',
      uc: CompleteTaskUcDef,
    },
  },
  refresh: [
    {
      event: TaskEvents.completed,
      params: { taskId: 'taskId' },
      subject: 'ownerId',
    },
  ],
});

/** Первая сторис: список — общий экран обеих сторис. */
export const PlanTasksStoryDef = StoryDef.define({
  name: 'planTasks',
  label: 'Планирование задач',
  description: 'Пользователь добавляет задачи в список.',
  callers: ['user'],
  goal: 'чтобы не забыть дела',
  start: TaskListScreenDef,
  screens: [TaskListScreenDef],
  outcomes: {
    created: {
      label: 'Задача добавлена',
      description: 'В списке появилась новая задача.',
      exits: [TaskListScreenDef.exits.created],
    },
  },
});

/** Вторая сторис: тот же список и карточка задачи. */
export const FinishTasksStoryDef = StoryDef.define({
  name: 'finishTasks',
  label: 'Выполнение задач',
  description: 'Пользователь отмечает задачи выполненными.',
  callers: ['user'],
  goal: 'чтобы закрыть сделанное',
  start: TaskListScreenDef,
  screens: [TaskListScreenDef, TaskCardScreenDef],
  outcomes: {
    closed: {
      label: 'Список закрыт',
      description: 'Пользователь закончил с задачами.',
      exits: [TaskListScreenDef.exits.closed],
    },
  },
});

export const TaskAssignedNotificationDef = NotificationDef.define({
  name: 'taskAssigned',
  label: 'Вам назначена задача',
  description: 'Исполнитель узнаёт о назначенной ему задаче.',
  event: TaskEvents.assigned,
  recipients: { from: 'payload', fields: ['assigneeId'] },
  reads: [ListTasksUcDef],
  data: v.object({ title: v.pipe(v.string(), v.description('Название')) }),
  links: () => [TaskCardScreenDef],
  examples: {
    sample: {
      label: 'Назначение',
      description: 'Назначена задача «Хлеб».',
      data: { title: 'Хлеб' },
    },
  },
});

export const TodoUiModuleDef = UiModuleDef.define({
  name: 'todo',
  label: 'Задачи',
  description: 'Экраны и сторис модуля задач.',
  screens: [TaskListScreenDef, TaskCardScreenDef],
  stories: [PlanTasksStoryDef, FinishTasksStoryDef],
  notifications: [TaskAssignedNotificationDef],
});

export const ExampleUiSetDef = UiSetDef.define({
  name: 'exampleUi',
  label: 'UI учебного приложения',
  description: 'Набор UI-модулей поверх учебного приложения.',
  app: ExampleAppDef,
  modules: [TodoUiModuleDef],
});

export const ExampleUiAppDef = UiAppDef.define({
  name: 'exampleConsole',
  label: 'Учебное приложение в консоли',
  description: 'Приложение UI для текстового канала.',
  set: ExampleUiSetDef,
  channel: 'dmg-ui-console',
  stories: [PlanTasksStoryDef, FinishTasksStoryDef],
  notifications: [TaskAssignedNotificationDef],
  entries: {
    start: {
      label: 'Начало',
      description: 'Список задач с начала.',
      address: TaskListScreenDef.at({ index: 0 }),
    },
  },
});
