// Учебный страничный канал: зародыш `dmg-ui/web-ui`. Половины
// разделены границей JSON — клиент (`client/`) видит только конец провода,
// сервер (`server/`) — только строки клиента. Внутренние `WirePorts`,
// `PageConnection`, `PageRegions`, `PageForms` наружу не выходят.

export {
  PageClient,
  type PageClientSpec,
  type PageConfirm,
  type PageFormValues,
  type PageInboxEntry,
  type PageRegionName,
  type PageRegionView,
  type PageRoute,
  type PageSlotJson,
  type PageSnapshot,
} from './client/page-client';
export { PageRenderer } from './client/page-renderer';
export {
  type AnyPageNotePresenter,
  type AnyPagePresenter,
  PageNotePresenter,
  type PageNoteRender,
  PagePresenter,
  type PageScreenRender,
  PageViews,
} from './client/page-views';
export {
  PageGraphProvider,
  type PageGraphSpec,
} from './graph/page-graph-provider';
export {
  type AnyPageRouteDef,
  type NormalizedPageRoute,
  PageRouteDef,
  type PageRouteSpec,
} from './graph/page-route-def';
export { PAGE_CHANNEL } from './page-channel.const';
export {
  PageHost,
  type PageHostSpec,
  type PageLogger,
  type PagePlace,
} from './server/page-host';
export { ClientMessage, ServerMessage } from './wire/page-messages';
export type {
  CallMessage,
  HelloMessage,
  NotificationMessage,
  PageRefusal,
  RefusedMessage,
  ResultMessage,
  SignalMessage,
  UnwatchMessage,
  WatchMessage,
  WatchRefusedMessage,
} from './wire/page-messages.types';
export { PageWire } from './wire/page-wire';
export type {
  ClientEnd,
  PageServerPort,
  ServerLink,
} from './wire/page-wire.types';
