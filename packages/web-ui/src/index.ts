// Страничный канал `dmg-ui/web-ui`. Половины разделены границей JSON — клиент
// (`client/`) видит только конец провода, сервер (`server/`) — только строки
// клиента; представления (`view/`) видят только источник состояния и цель
// показа. Провод — в памяти (`PageWire`) или на сокете: мост сокета сервера
// `PageSockets`, ворота запроса соединения `PageGate` и конец сокета клиента
// `PageSocketEnd` с адаптером `PageBrowserSocket`; переподключатель `PageReconnector` даёт вкладке новый
// конец (`PageClient.attach`). Входящие вкладки — источник вида
// `PageClient.inbox()`; время вкладки — порт `PageClock` с умолчанием
// `PageSystemClock`; история вкладки — порт `PageHistoryPort` с привязкой
// `PageBrowserHistory` поверх узкого типа окна `PageBrowserWindow` (D-UI-81).
// Маршрут `PageRouteDef` и кодек адреса в URL `PageUrls` лежат в `url/`
// (D-UI-76): строка на входе и выходе, без браузера.
// Пределы строки кадра `MAX_CLIENT_TEXT`, `MAX_SERVER_TEXT` нужны привязке
// сервера сокетов: от них считаются `maxPayloadLength` и `backpressureLimit`.
// Внутренние `WirePorts`, `PageConnection`, `PageOutbox`, `serverFrame`,
// `PageRegions`, `PagePlacements`, `PageForms`, `PageInbox`, `PageSeenKeys`,
// `ViewCell`, `PageTextPresenter`, `PagePath`, `PageParams`, `PageLayoutUrls`,
// `PageHistory`, `PageHistoryRecord`, `PageOverlay` наружу не выходят. Жест
// показывает ожидаемый итог до ответа — функция представления `PageExpected`
// (D-UI-84). Областей три — основная, соседняя и модальная
// (`PageRegionName`): куда открыть переход, объявляет приложение страниц
// (`PagePlacement`).

export { PageBrowserHistory } from './client/page-browser-history';
export { PageBrowserSocket } from './client/page-browser-socket';
export {
  PageClient,
  type PageClientSpec,
  type PageFormValues,
  type PageInboxEntry,
  type PagePlacement,
  type PageRegionName,
  type PageSlotJson,
  type PageSnapshot,
} from './client/page-client';
export type { PageClock } from './client/page-clock.types';
export type {
  PageBrowserWindow,
  PageHistoryEntry,
  PageHistoryPort,
} from './client/page-history.types';
export { PageReconnector } from './client/page-reconnector';
export type { PageReconnectorSpec } from './client/page-reconnector.types';
export type {
  PageDialFailure,
  PageSocket,
  PageSocketEvents,
} from './client/page-socket.types';
export { PageSocketEnd } from './client/page-socket-end';
export { PageSystemClock } from './client/page-system-clock';
export { PageText } from './client/page-text';
export {
  type PageAppSpec,
  PageGraphProvider,
  type PageGraphSpec,
} from './graph/page-graph-provider';
export { PAGE_CHANNEL } from './page-channel.const';
export { PageGate } from './server/page-gate';
export {
  PageHost,
  type PageHostSpec,
  type PageLogger,
} from './server/page-host';
export type {
  PageAdmission,
  PageGateRefusal,
  PageGateSpec,
  PageHeaders,
  PageServerSocket,
  PageSocketsSpec,
} from './server/page-server.types';
export { PageSockets } from './server/page-sockets';
export {
  type AnyPageRouteDef,
  type NormalizedPageRoute,
  PageRouteDef,
  type PageRouteSpec,
} from './url/page-route-def';
export {
  type PageRoute,
  type PageUrlRejection,
  PageUrls,
  type PageUrlsSpec,
} from './url/page-urls';
export type {
  PageForm,
  PageFormField,
  PageFormSet,
} from './view/page-form.types';
export { PageFormModel } from './view/page-form-model';
export type {
  PageRegionPresenter,
  PageTextTarget,
} from './view/page-region-presenter.types';
export { PageRenderer } from './view/page-renderer';
export type {
  PageConfirm,
  PageEntered,
  PageExpected,
  PageStaleReason,
  PageViewState,
  PageViewStatus,
} from './view/page-view-state.types';
export {
  type AnyPageNotePresenter,
  type AnyPagePresenter,
  PageNotePresenter,
  type PageNoteRender,
  PagePresenter,
  type PageScreenRender,
  PageViews,
} from './view/page-views';
export type { ViewSource } from './view/view-source.types';
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
export { MAX_CLIENT_TEXT, MAX_SERVER_TEXT } from './wire/page-wire.const';
export type {
  ClientEnd,
  PageServerPort,
  ServerLink,
} from './wire/page-wire.types';
