import { F } from 'dmg-core';
import { GetUserUcDef } from 'dmg-core/testing/example';
import { type AnyScreenDef, ScreenDef } from 'dmg-ui';
import * as v from 'valibot';
import { OWNER } from '../../todo/shared/example-tasks';
import { UserCardScreenDef } from '../../users/view-user/user-card.screen';

/**
 * Мой профиль (D-UI-119): активна ли учётная запись вызывающего. Адрес без
 * параметров — человек определяется субъектом беседы; данные — ответ `getUser`.
 */
export const ProfileSummaryScreenDef = ScreenDef.define({
  name: 'profileSummary',
  label: 'Мой профиль',
  description: 'Сводка своей учётной записи: активна ли она.',
  reads: [GetUserUcDef],
  data: v.object({
    userId: F.uuid('пользователя'),
    active: F.boolean('Учётная запись активна'),
  }),
  actions: {
    card: {
      label: 'Карточка пользователя',
      description: 'Открыть карточку своей учётной записи.',
      // Переход в чужой модуль — на экран `start` его сторис.
      to: (): readonly AnyScreenDef[] => [UserCardScreenDef],
    },
    close: {
      label: 'Закрыть',
      description: 'Закончить просмотр профиля.',
    },
  },
  exits: {
    closed: {
      label: 'Профиль просмотрен',
      description: 'Пользователь закрыл профиль.',
    },
  },
  examples: {
    active: {
      label: 'Активная учётная запись',
      description: 'Пользователь активен.',
      params: {},
      data: { userId: OWNER, active: true },
    },
  },
});
