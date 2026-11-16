import type { AnyNotificationDef } from '../manifest/notification-def.types';
import type { AnyScreenDef } from '../manifest/screen-def.types';
import type { AnyStoryDef } from '../manifest/story-def.types';

/** Def, на который ссылается ребро графа: экран, сторис или уведомление. */
export type UiTarget = AnyScreenDef | AnyStoryDef | AnyNotificationDef;
