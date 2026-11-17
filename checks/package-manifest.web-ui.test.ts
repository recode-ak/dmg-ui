import { describe, expect, it } from 'bun:test';
import type {
  PageRegionPresenter,
  PageStaleReason,
  PageTextTarget,
  PageViewState,
  PageViewStatus,
  ViewSource,
} from 'dmg-ui/web-ui';

// Составы входов страничного пакета: канал, его имя, контракт представления,
// текстовая страница, сообщения и провод в памяти — в `dmg-ui/web-ui`;
// привязка учебного примера к каналу — в `dmg-ui/web-ui/testing`. Внутренние
// помощники клиента, представлений и сервера наружу не выходят.

const WEB_UI = [
  'ClientMessage',
  'PAGE_CHANNEL',
  'PageClient',
  'PageGraphProvider',
  'PageHost',
  'PageNotePresenter',
  'PagePresenter',
  'PageRenderer',
  'PageRouteDef',
  'PageText',
  'PageViews',
  'PageWire',
  'ServerMessage',
];

describe('вход dmg-ui/web-ui', () => {
  it('состав — клиент, представления, рендерер, текстовая страница, граф и маршруты, сервер, сообщения и провод в памяти', async () => {
    expect(Object.keys(await import('dmg-ui/web-ui')).sort()).toEqual(WEB_UI);
  });

  it('имя канала прежнее', async () => {
    const { PAGE_CHANNEL } = await import('dmg-ui/web-ui');

    expect(PAGE_CHANNEL).toBe('dmg-ui-pages');
  });

  it('внутренние помощники клиента, представлений и сервера не экспортируются', async () => {
    const exported = Object.keys(await import('dmg-ui/web-ui'));

    for (const internal of [
      'WirePorts',
      'PageConnection',
      'PageRegions',
      'PageForms',
      'PageTraces',
      'PageInbox',
      'ViewCell',
      'PageTextPresenter',
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

describe('вход dmg-ui/web-ui/testing', () => {
  it('состав — привязка учебного примера к страничному каналу', async () => {
    expect(Object.keys(await import('dmg-ui/web-ui/testing')).sort()).toEqual([
      'ExamplePagesAppDef',
      'ExamplePagesArch',
      'examplePageRoutes',
      'examplePageViews',
    ]);
  });
});
