import { describe, expect, it } from 'bun:test';
import type {
  PageAdmission,
  PageClientSpec,
  PageClock,
  PageDialFailure,
  PageGateRefusal,
  PageGateSpec,
  PageHeaders,
  PageInboxEntry,
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
// переподключатель и часы вкладки, ворота соединения, кодек адреса в URL —
// в `dmg-ui/web-ui`; привязка учебного примера к каналу и подставные часы —
// в `dmg-ui/web-ui/testing`. Внутренние помощники клиента, представлений,
// сервера и кодека адреса наружу не выходят.

const WEB_UI = [
  'ClientMessage',
  'PAGE_CHANNEL',
  'PageBrowserSocket',
  'PageClient',
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
  it('состав — клиент, представления, рендерер, текстовая страница, граф и маршруты, сервер, сообщения, провод в памяти, мост и конец сокета, переподключатель и часы, ворота, кодек адреса в URL', async () => {
    expect(Object.keys(await import('dmg-ui/web-ui')).sort()).toEqual(WEB_UI);
  });

  it('имя канала прежнее', async () => {
    const { PAGE_CHANNEL } = await import('dmg-ui/web-ui');

    expect(PAGE_CHANNEL).toBe('dmg-ui-pages');
  });

  it('внутренние помощники клиента, представлений, сервера, провода и кодека адреса не экспортируются', async () => {
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
  it('состав — привязка учебного примера к страничному каналу и подставные часы', async () => {
    expect(Object.keys(await import('dmg-ui/web-ui/testing')).sort()).toEqual([
      'ExamplePagesAppDef',
      'ExamplePagesArch',
      'ManualPageClock',
      'examplePageRoutes',
      'examplePageViews',
    ]);
  });
});
