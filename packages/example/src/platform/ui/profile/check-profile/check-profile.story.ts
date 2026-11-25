import { type AnyStoryDef, StoryDef } from 'dmg-ui';
import { ViewUserStoryDef } from '../../users/view-user/view-user.story';
import { ProfileSummaryScreenDef } from './profile-summary.screen';

/** Сторис «Мой профиль»: человек проверяет свою учётную запись. */
export const CheckProfileStoryDef = StoryDef.define({
  name: 'checkProfile',
  label: 'Мой профиль',
  description: 'Пользователь проверяет, активна ли его учётная запись.',
  hint: 'Проверьте, активна ли ваша учётная запись',
  callers: ['user'],
  goal: 'чтобы убедиться, что учётная запись активна',
  start: ProfileSummaryScreenDef,
  screens: [ProfileSummaryScreenDef],
  leads: (): readonly AnyStoryDef[] => [ViewUserStoryDef],
  outcomes: {
    done: {
      label: 'Профиль просмотрен',
      description: 'Пользователь закрыл профиль.',
      exits: [ProfileSummaryScreenDef.exits.closed],
    },
  },
});
