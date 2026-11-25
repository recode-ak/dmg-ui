import { UsersUiModuleDef } from 'dmg-ui/example';
import { PageViews } from 'dmg-ui/web-ui';
import { UserCardView } from './user-card.view';

/** Представления модуля `users` учебного примера на страницах. */
export const usersPagesViews = PageViews.of(UsersUiModuleDef, [UserCardView]);
