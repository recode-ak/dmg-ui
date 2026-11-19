import { type AnyStoryDef, StoryDef } from 'dmg-ui';
import { PlanTasksStoryDef } from '../todo/plan-tasks.story';
import { UserCardScreenDef } from './user-card.screen';

/** Сторис «Карточка пользователя»: человек смотрит учётную запись. */
export const ViewUserStoryDef = StoryDef.define({
  name: 'viewUser',
  label: 'Карточка пользователя',
  description: 'Пользователь смотрит карточку учётной записи.',
  hint: 'Посмотрите, активна ли учётная запись',
  callers: ['user'],
  goal: 'чтобы увидеть, активна ли учётная запись',
  start: UserCardScreenDef,
  screens: [UserCardScreenDef],
  // D-UI-108: переход карточки на список задач разрешён связью со сторис списка.
  leads: (): readonly AnyStoryDef[] => [PlanTasksStoryDef],
  outcomes: {
    done: {
      label: 'Карточка просмотрена',
      description: 'Пользователь закрыл карточку.',
      exits: [UserCardScreenDef.exits.closed],
    },
  },
});
