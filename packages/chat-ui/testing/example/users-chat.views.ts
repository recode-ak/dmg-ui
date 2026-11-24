import { ChatViews } from 'dmg-ui/chat-ui';
import { UsersUiModuleDef } from 'dmg-ui/testing';
import { UserCardView } from './user-card.view';

/** Представления модуля `users` учебного примера в диалоговом канале. */
export const usersChatViews = ChatViews.of(UsersUiModuleDef, [UserCardView]);
