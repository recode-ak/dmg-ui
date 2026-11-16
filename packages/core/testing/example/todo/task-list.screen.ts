import { F } from 'dmg-core';
import {
  CompleteTasksUcDef,
  CreateTaskUcDef,
  ListTasksUcDef,
  TaskErrors,
  TaskEvents,
} from 'dmg-core/testing/example';
import { type AnyScreenDef, ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { TASK_A, TASK_B, taskRow } from './example-tasks';
import { TaskCardScreenDef } from './task-card.screen';

// Взаимные thunk `to` аннотированы: без типа возврата TS выводит `any` для
// обоих экранов (TS7022, цикл вывода).

/**
 * Список задач вызывающего по страницам: выбор задач (состояние и локальное
 * действие), выполнение выбранных с подтверждением, создание — основное
 * действие, выходы сторис, перечитывание по своим событиям.
 */
export const TaskListScreenDef = ScreenDef.define({
  name: 'taskList',
  label: 'Мои задачи',
  description: 'Список задач вызывающего с выбором для выполнения.',
  params: v.strictObject({
    page: v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.description('Номер страницы списка, с нуля'),
    ),
  }),
  reads: [ListTasksUcDef],
  data: v.object({
    tasks: v.pipe(v.array(taskRow), v.description('Задачи страницы')),
    hasMore: v.pipe(v.boolean(), v.description('Есть следующая страница')),
    hasPrev: v.pipe(v.boolean(), v.description('Есть предыдущая страница')),
  }),
  state: v.strictObject({
    selected: v.pipe(
      v.array(F.uuid('выбранной задачи')),
      v.description('Выбранные задачи'),
    ),
  }),
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
      description: 'Отмечает выбранные открытые задачи выполненными.',
      uc: CompleteTasksUcDef,
      confirm: {
        label: 'Выполнить выбранные задачи?',
        description: 'Выполненную задачу нельзя вернуть в работу.',
      },
    },
    next: {
      label: 'Дальше',
      description: 'Следующая часть списка.',
    },
    prev: {
      label: 'Назад',
      description: 'Предыдущая часть списка.',
    },
    close: {
      label: 'Закрыть',
      description: 'Закончить работу со списком.',
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
    { event: TaskEvents.completed, subject: 'ownerId' },
  ],
  catches: [TaskErrors.TOO_MANY_OPEN],
  examples: {
    empty: {
      label: 'Пустой список',
      description: 'Задач ещё нет.',
      params: { page: 0 },
      data: { tasks: [], hasMore: false, hasPrev: false },
      state: { selected: [] },
    },
    full: {
      label: 'Список с выбором',
      description: 'Две задачи, одна выбрана, есть следующая страница.',
      params: { page: 0 },
      data: {
        tasks: [
          { uuid: TASK_A, title: 'Хлеб', status: 'open' },
          { uuid: TASK_B, title: 'Молоко', status: 'done' },
        ],
        hasMore: true,
        hasPrev: false,
      },
      state: { selected: [TASK_A] },
    },
  },
});
