import { describe, expect, it } from 'bun:test';
import type {
  PageAdmission,
  PageBrowserWindow,
  PageClientSpec,
  PageClock,
  PageDialFailure,
  PageEntered,
  PageExpected,
  PageForm,
  PageFormField,
  PageFormSet,
  PageGateRefusal,
  PageGateSpec,
  PageHeaders,
  PageHistoryEntry,
  PageHistoryPort,
  PageInboxEntry,
  PagePlacement,
  PageReconnectorSpec,
  PageRegionPresenter,
  PageRoute,
  PageServerSocket,
  PageSocket,
  PageSocketEvents,
  PageSocketsSpec,
  PageStaleReason,
  PageTextTarget,
  PageUrlRejection,
  PageUrlsSpec,
  PageViewState,
  PageViewStatus,
  ViewSource,
} from 'dmg-ui/web-ui';

// Составы входов страничного пакета: канал, его имя, контракт представления,
// текстовая страница, сообщения, провод в памяти, мост и конец сокета,
// переподключатель и часы вкладки, ворота соединения, кодек адреса в URL,
// модель формы области, привязка истории вкладки — в `dmg-ui/web-ui`;
// привязка учебного примера к каналу, подставные часы и история — в
// `dmg-ui/web-ui/testing`. Внутренние помощники клиента, представлений,
// сервера, истории и кодека адреса наружу не выходят.

const WEB_UI = [
  'ClientMessage',
  'MAX_CLIENT_TEXT',
  'MAX_SERVER_TEXT',
  'PAGE_CHANNEL',
  'PageBrowserHistory',
  'PageBrowserSocket',
  'PageClient',
  'PageFormModel',
  'PageGate',
  'PageGraphProvider',
  'PageHost',
  'PageNotePresenter',
  'PagePresenter',
  'PageReconnector',
  'PageRenderer',
  'PageRouteDef',
  'PageSocketEnd',
  'PageSockets',
  'PageSystemClock',
  'PageText',
  'PageUrls',
  'PageViews',
  'PageWire',
  'ServerMessage',
];

describe('вход dmg-ui/web-ui', () => {
  it('состав — клиент, представления, рендерер, текстовая страница, граф и маршруты, сервер, сообщения, провод в памяти, мост и конец сокета, переподключатель и часы, ворота, кодек адреса в URL, модель формы, привязка истории', async () => {
    expect(Object.keys(await import('dmg-ui/web-ui')).sort()).toEqual(WEB_UI);
  });

  it('пределы кадра экспортируются: клиент — 64 КиБ, сервер — 1 МиБ', async () => {
    const { MAX_CLIENT_TEXT, MAX_SERVER_TEXT } = await import('dmg-ui/web-ui');

    expect(MAX_CLIENT_TEXT).toBe(65536);
    expect(MAX_SERVER_TEXT).toBe(1048576);
  });

  it('имя канала прежнее', async () => {
    const { PAGE_CHANNEL } = await import('dmg-ui/web-ui');

    expect(PAGE_CHANNEL).toBe('dmg-ui-pages');
  });

  it('внутренние помощники клиента, истории, представлений, сервера, провода и кодека адреса не экспортируются', async () => {
    const exported = Object.keys(await import('dmg-ui/web-ui'));

    for (const internal of [
      'WirePorts',
      'PageConnection',
      'PageRegions',
      'PageForms',
      'PageTraces',
      'PageInbox',
      'PageSeenKeys',
      'ViewCell',
      'PageTextPresenter',
      'PageOutbox',
      'serverFrame',
      'PagePath',
      'PageParams',
      'PagePlacements',
      'PageLayoutUrls',
      'PageHistory',
      'PageHistoryRecord',
      'PageOverlay',
    ]) {
      expect(exported).not.toContain(internal);
    }
  });
});

/**
 * Состав типов контракта представления во входе `dmg-ui/web-ui`. Типы
 * стираются при запуске, поэтому их проверяет `tsc` проверки репо: тип
 * пропал из входа, поле состояния исчезло или сменилась форма метода — файл
 * не компилируется. Рантайм-утверждения нет: оно проверяло бы только себя.
 */
export type WebUiViewTypes = [
  PageViewStatus,
  PageStaleReason,
  PageViewState['status'],
  PageViewState['address'],
  PageViewState['view'],
  PageViewState['refreshing'],
  PageViewState['stale'],
  PageViewState['note'],
  PageViewState['issues'],
  PageViewState['confirm'],
  PageViewState['entered'],
  PageViewState['expected'],
  PageExpected,
  ViewSource<PageViewState>['get'],
  ViewSource<PageViewState>['subscribe'],
  PageRegionPresenter<PageTextTarget>['show'],
  PageTextTarget['write'],
];

/**
 * Состав типов сокета и ворот во входе `dmg-ui/web-ui` — так же через `tsc`:
 * привязка приложения к серверу сокетов и сокету браузера пишется по ним.
 */
export type WebUiSocketTypes = [
  PageServerSocket['data'],
  PageServerSocket['send'],
  PageServerSocket['close'],
  PageAdmission['token'],
  PageSocketsSpec['host'],
  PageSocketsSpec['logger'],
  PageSocket['send'],
  PageSocket['close'],
  PageSocket['listen'],
  PageSocketEvents['message'],
  PageSocketEvents['closed'],
  PageGateSpec['origins'],
  PageGateSpec['cookie'],
  PageHeaders['get'],
  PageGateRefusal,
];

/**
 * Состав типов переподключения, часов и входящих во входе `dmg-ui/web-ui` —
 * так же через `tsc`: привязка вкладки к сокету и представление входящих
 * пишутся по ним.
 */
export type WebUiReconnectTypes = [
  PageClock['now'],
  PageClock['after'],
  PageReconnectorSpec['sockets'],
  PageReconnectorSpec['clock'],
  PageReconnectorSpec['random'],
  PageReconnectorSpec['faults'],
  PageDialFailure,
  PageInboxEntry['notification'],
  PageInboxEntry['data'],
  PageInboxEntry['links'],
  PageClientSpec['clock'],
];

/**
 * Состав типов компоновки и формы во входе `dmg-ui/web-ui` — так же через
 * `tsc`: объявление размещения экранов, введённое в отвергнутую форму и
 * модель формы области пишутся по ним.
 */
export type WebUiLayoutTypes = [
  PagePlacement,
  PagePlacement['screen'],
  PagePlacement['region'],
  PageClientSpec['placements'],
  PageEntered,
  PageForm,
  PageFormField,
  PageFormSet,
];

/**
 * Состав типов истории вкладки во входе `dmg-ui/web-ui` — так же через
 * `tsc`: привязка вкладки к истории браузера и подставная история пишутся по
 * ним.
 */
export type WebUiHistoryTypes = [
  PageHistoryPort['current'],
  PageHistoryPort['push'],
  PageHistoryPort['replace'],
  PageHistoryPort['onTraverse'],
  PageHistoryEntry['url'],
  PageHistoryEntry['record'],
  PageBrowserWindow['history'],
  PageBrowserWindow['location'],
  PageClientSpec['history'],
];

/**
 * Состав типов кодека адреса во входе `dmg-ui/web-ui` — так же через `tsc`:
 * привязка вкладки к адресной строке и маршруты приложения пишутся по ним.
 */
export type WebUiUrlTypes = [
  PageUrlsSpec['app'],
  PageUrlsSpec['routes'],
  PageUrlRejection,
  PageRoute['path'],
  PageRoute['entry'],
];

describe('вход dmg-ui/web-ui/testing', () => {
  it('состав — привязка учебного примера к страничному каналу, подставные часы и история', async () => {
    expect(Object.keys(await import('dmg-ui/web-ui/testing')).sort()).toEqual([
      'ExamplePagesAppDef',
      'ExamplePagesArch',
      'ManualPageClock',
      'MemoryPageHistory',
      'examplePageRoutes',
      'examplePageViews',
      'exampleWindowPlacements',
    ]);
  });
});
