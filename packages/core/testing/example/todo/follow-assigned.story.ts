import { type AnyStoryDef, StoryDef } from 'dmg-ui';
import { ViewUserStoryDef } from '../users/view-user.story';
import { AssignedTasksScreenDef } from './assigned-tasks.screen';

/** Сторис «Поручения»: исполнитель смотрит назначенные ему задачи и свою карточку. */
export const FollowAssignedStoryDef = StoryDef.define({
  name: 'followAssigned',
  label: 'Поручения',
  description: 'Пользователь смотрит задачи, которые ему поручили.',
  callers: ['user'],
  goal: 'чтобы видеть, что поручили мне',
  start: AssignedTasksScreenDef,
  screens: [AssignedTasksScreenDef],
  outcomes: {
    done: {
      label: 'Поручения просмотрены',
      description: 'Пользователь закрыл список поручений.',
      exits: [AssignedTasksScreenDef.exits.closed],
    },
  },
  leads: (): readonly AnyStoryDef[] => [ViewUserStoryDef],
});
