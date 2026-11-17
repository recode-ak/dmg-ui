import { describe, expect, it } from 'bun:test';

// Составы входов страничного пакета: канал, его имя, сообщения и провод в
// памяти — в `dmg-ui/web-ui`; привязка учебного примера к каналу — в
// `dmg-ui/web-ui/testing`. Внутренние помощники клиента и сервера наружу не
// выходят.

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
  'PageViews',
  'PageWire',
  'ServerMessage',
];

describe('вход dmg-ui/web-ui', () => {
  it('состав — клиент, представления, рендерер, граф и маршруты, сервер, сообщения и провод в памяти', async () => {
    expect(Object.keys(await import('dmg-ui/web-ui')).sort()).toEqual(WEB_UI);
  });

  it('имя канала прежнее', async () => {
    const { PAGE_CHANNEL } = await import('dmg-ui/web-ui');

    expect(PAGE_CHANNEL).toBe('dmg-ui-pages');
  });

  it('внутренние помощники клиента и сервера не экспортируются', async () => {
    const exported = Object.keys(await import('dmg-ui/web-ui'));

    for (const internal of [
      'WirePorts',
      'PageConnection',
      'PageRegions',
      'PageForms',
      'PageTraces',
      'PageInbox',
    ]) {
      expect(exported).not.toContain(internal);
    }
  });
});

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
