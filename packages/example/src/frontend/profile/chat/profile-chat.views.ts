import { ChatViews } from 'dmg-ui/chat-ui';
import { ProfileUiModuleDef } from '../../../platform/ui';
import { ProfileSummaryView } from './check-profile/profile-summary.view';

/** Представления модуля `profile` учебного примера в диалоговом канале. */
export const profileChatViews = ChatViews.of(ProfileUiModuleDef, [
  ProfileSummaryView,
]);
