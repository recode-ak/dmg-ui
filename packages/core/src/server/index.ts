// Вход dmg-ui/server: серверная часть ядра UI — сессии и маршруты UC, подписки,
// уведомления, бэкенды вызова. Отдельно от корня: исполнитель экрана и код
// экрана не тянут `dmg-core/app` и `/graph`.

export { ApiAppDispatch } from './api-app-dispatch';
export { ModuleApiDispatch } from './module-api-dispatch';
export { RenderFlags } from './render-flags';
export type {
  CallerSource,
  ChannelNode,
  DeliveredNotification,
  NotificationDelivery,
  RecipientCallers,
  ServerContext,
  UiNotifierSpec,
  UiServerSpec,
} from './server.types';
export type { UcDispatch, UcRequest } from './ucs-dispatch.types';
export { UiNotifier } from './ui-notifier';
export { UiServer } from './ui-server';
export { UiSession } from './ui-session';
