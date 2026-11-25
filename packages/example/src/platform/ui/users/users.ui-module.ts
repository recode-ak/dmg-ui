import { UiModuleDef } from 'dmg-ui';
import { UserCardScreenDef } from './view-user/user-card.screen';
import { ViewUserStoryDef } from './view-user/view-user.story';

/** UI-модуль пользователей: карточка пользователя и сторис её просмотра. */
export const UsersUiModuleDef = UiModuleDef.define({
  name: 'users',
  label: 'Пользователи',
  description: 'Экран и сторис модуля пользователей.',
  screens: [UserCardScreenDef],
  stories: [ViewUserStoryDef],
});
