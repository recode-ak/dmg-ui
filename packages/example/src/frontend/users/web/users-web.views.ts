import { UsersUiModuleDef } from '../../../platform/ui';
import { ExampleViews } from '../../web-kit/example-views';
import { UserCardView } from './view-user/user-card.view';

/** Представления модуля `users` примера на DOM. */
export const usersWebViews = ExampleViews.of(UsersUiModuleDef, [UserCardView]);
