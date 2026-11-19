import { F } from 'dmg-core';
import { GetUserUcDef } from 'dmg-core/testing/example';
import { ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { OWNER } from '../todo/example-tasks';

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
