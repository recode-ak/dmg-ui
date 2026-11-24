import { UsersUiModuleDef } from 'dmg-ui/testing';
import { ExampleViews } from './example-views';
import { UserCardView } from './user-card.view';

/** Представления модуля `users` примера на DOM. */
export const usersWebViews = ExampleViews.of(UsersUiModuleDef, [UserCardView]);
