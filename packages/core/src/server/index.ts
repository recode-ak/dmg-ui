// Вход dmg-ui/server: серверная часть ядра UI — сессии и маршруты UC, подписки,
// уведомления, бэкенды вызова. Отдельно от корня: исполнитель экрана и код
// экрана не тянут `dmg-core/app` и `/graph`.

export { ApiAppDispatch } from './api-app-dispatch';
export { ModuleApiDispatch } from './module-api-dispatch';
export { RenderContexts } from './render-contexts';
export { RenderFlags } from './render-flags';
export type {
  CallerContext,
  CallerSource,
  ChannelNode,
  DeliveredNotification,
  NotificationDelivery,
  PersonPlaces,
  RecipientCallers,
  ServerContext,
  UiNotifierSpec,
  UiServerSpec,
} from './server.types';
export type { UcDispatch, UcRequest } from './ucs-dispatch.types';
export { UiNotifier } from './ui-notifier';
export { UiServer } from './ui-server';
export type { UiSession } from './ui-session';
