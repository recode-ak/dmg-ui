import { ChatViews } from 'dmg-ui/chat-ui';
import { UsersUiModuleDef } from '../../../platform/ui';
import { UserCardView } from './view-user/user-card.view';

/** Представления модуля `users` учебного примера в диалоговом канале. */
export const usersChatViews = ChatViews.of(UsersUiModuleDef, [UserCardView]);
