import { F } from 'dmg-core';
import { GetUserUcDef } from 'dmg-core/testing/example';
import { type AnyScreenDef, ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { OWNER } from '../../todo/shared/example-tasks';
import { TaskListScreenDef } from '../../todo/shared/task-list.screen';

/**
 * Карточка пользователя: активна ли его учётная запись. Данные — ответ
 * `getUser`; человеку он отдаётся по праву «сам или администратор».
 */
export const UserCardScreenDef = ScreenDef.define({
  name: 'userCard',
  label: 'Пользователь',
  description: 'Карточка пользователя: активна ли учётная запись.',
  params: v.strictObject({ userId: F.uuid('пользователя') }),
  reads: [GetUserUcDef],
  data: v.object({
    userId: F.uuid('пользователя'),
    active: F.boolean('Учётная запись активна'),
  }),
  actions: {
    // D-UI-108: структурный переход — обычное действие `to`, уходящая карточка попадает в путь.
    tasks: {
      label: 'К моим задачам',
      description: 'Переход к списку своих задач.',
      to: (): readonly AnyScreenDef[] => [TaskListScreenDef],
    },
    close: {
      label: 'Закрыть',
      description: 'Закончить просмотр карточки пользователя.',
    },
  },
  exits: {
    closed: {
      label: 'Карточка просмотрена',
      description: 'Пользователь закрыл карточку.',
    },
  },
  examples: {
    active: {
      label: 'Активная учётная запись',
      description: 'Пользователь активен.',
      params: { userId: OWNER },
      data: { userId: OWNER, active: true },
    },
  },
});
