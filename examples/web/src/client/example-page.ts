import { exampleCodes } from 'dmg-ui/testing';
import {
  PageBrowserHistory,
  PageBrowserSocket,
  PageClient,
  PageReconnector,
  PageSystemClock,
} from 'dmg-ui/web-ui';
import {
  ExamplePagesUiAppDef,
  examplePagesRoutes,
  exampleSubjectWire,
} from 'dmg-ui/web-ui/testing';
import type { ExampleRegion } from '../common/example-web.types';
import { ExampleGestures } from '../view/example-gestures';
import { ExampleStepPlace } from '../view/example-step-place';
import { exampleWebPlacements } from '../view/example-web.placements';
import { exampleWebViews } from '../view/example-web.views';
import { FormDrafts } from '../view/form-drafts';
import { HotkeyPress } from '../view/hotkey-press';
import { LinkClick } from '../view/link-click';
import { RegionFrame } from '../view/region-frame';
import type { RegionModel } from '../view/region-model.types';
import { CLIENT_TEXTS, CONSOLE_FAULT } from './client-texts.const';
import { DialogDom } from './dialog-dom';
import { h } from './dom-element';
import { DragDom } from './drag-dom';
import type { ExamplePageEnv } from './example-page.types';
import { InboxDom } from './inbox-dom';
import { PageLayout } from './page-layout';
import { RegionDom } from './region-dom';

/**
 * Привязка страницы примера к браузеру: переподключатель и клиент вкладки,
 * показ областей и входящих, перехват щелчков по ссылкам, перетаскивание,
 * клавиша поля основной формы.
 * Порядок: «Подключение…» → сокет → клиент → показ → первая загрузка по
 * адресной строке. Среду читает один `main.ts`; сюда она приходит в `env`.
 */
export class ExamplePage {
  /** Последние модели областей — для решений вне области (приём перетаскивания). */
  private readonly models = new Map<ExampleRegion, RegionModel>();

  /** Приложение страницы: одно для клиента и для справки областей. */
  private readonly app = ExamplePagesUiAppDef;

  constructor(private readonly env: ExamplePageEnv) {}

  async start(): Promise<void> {
    const { env } = this;
    const layout = new PageLayout(env.root);
    layout.say(CLIENT_TEXTS.connecting);
    const reconnector = new PageReconnector({
      sockets: () => new PageBrowserSocket(env.connect()),
      clock: new PageSystemClock(),
    });
    // Закрывает сокет вкладки; попыток после этого больше нет.
    env.browser.addEventListener('pagehide', () => reconnector.close());
    // Страница из кэша «Назад»: сокет закрыт навсегда — загрузить заново.
    env.browser.addEventListener('pageshow', (event) => {
      if (event.persisted) env.reload();
    });
    // Отказ — только у закрытого переподключателя: страница уходит.
    const end = await reconnector.connect().catch(() => undefined);
    if (end === undefined) return;
    const client = new PageClient({
      app: this.app,
      codes: exampleCodes({}, this.app),
      routes: examplePagesRoutes,
      end,
      placements: exampleWebPlacements,
      observer: { record: () => {} },
      faults: () => env.log(CONSOLE_FAULT),
      history: new PageBrowserHistory(env.browser),
      stepPlace: ExampleStepPlace.key,
      reviveSubject: exampleSubjectWire.revive,
    });
    reconnector.follow(end, (next) => client.attach(next));
    const gestures = new ExampleGestures(client, env.log);
    this.show(client, gestures, layout);
    this.follow(gestures);
    this.hotkeys(layout);
    layout.say('');
    await client.boot().catch(() => this.failed(layout));
  }

  /** Области и входящие: каждая область — своё представление поверх источника клиента. */
  private show(
    client: PageClient,
    gestures: ExampleGestures,
    layout: PageLayout,
  ): void {
    const drafts = new FormDrafts();
    const drag = new DragDom();
    const dialog = new DialogDom(layout.modal, () =>
      gestures.closeRegion('modal'),
    );
    const remember = (name: ExampleRegion) => (model: RegionModel) => {
      this.models.set(name, model);
    };
    const common = { drafts, gestures, drag };
    new RegionDom({
      ...common,
      name: 'main',
      frame: new RegionFrame(this.app),
      onModel: remember('main'),
    }).show(client.source('main'), layout.main);
    new RegionDom({
      ...common,
      name: 'side',
      frame: new RegionFrame(this.app),
      close: () => gestures.closeRegion('side'),
      placeholder: CLIENT_TEXTS.sidePlaceholder,
      onModel: remember('side'),
    }).show(client.source('side'), layout.side);
    const modal = remember('modal');
    new RegionDom({
      ...common,
      name: 'modal',
      frame: new RegionFrame(this.app),
      close: () => gestures.closeRegion('modal'),
      onModel: (model) => {
        modal(model);
        dialog.sync(model);
      },
    }).show(client.source('modal'), dialog.body);
    new InboxDom(exampleWebViews, gestures).show(client.inbox(), layout.inbox);
    // Строка списка, брошенная на соседнюю область, открывает карточку.
    drag.target(
      layout.side,
      'row',
      () => this.listIdle(),
      (taskId) => {
        const revision = this.models.get('main')?.revision;
        if (revision !== undefined) void gestures.openTask(taskId, revision);
      },
    );
  }

  /** Список в основной области готов принять жест: не приглушён и с ревизией. */
  private listIdle(): boolean {
    const main = this.models.get('main');
    return (
      main?.body?.kind === 'list' && !main.busy && main.revision !== undefined
    );
  }

  /** Щелчок по ссылке страницы — переход внутри неё, если правило `LinkClick` не оставило его браузеру. */
  private follow(gestures: ExampleGestures): void {
    const { browser, origin } = this.env;
    browser.addEventListener('click', (event) => {
      const anchor =
        event.target instanceof Element ? event.target.closest('a') : null;
      if (anchor === null) return;
      const path = LinkClick.target(
        {
          href: anchor.getAttribute('href') ?? undefined,
          button: event.button,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          defaultPrevented: event.defaultPrevented,
          target: anchor.getAttribute('target') ?? undefined,
          download: anchor.hasAttribute('download'),
        },
        origin,
      );
      if (path === undefined) return;
      event.preventDefault();
      void gestures.follow(path);
    });
  }

  /**
   * Клавиша страницы (`HotkeyPress`) — фокус на поле с этой клавишей: в
   * открытом окне, иначе в основной, затем в соседней области.
   */
  private hotkeys(layout: PageLayout): void {
    this.env.browser.addEventListener('keydown', (event) => {
      const target = event.target;
      const key = HotkeyPress.key({
        key: event.key,
        code: event.code,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        editable:
          target instanceof HTMLElement &&
          (target.isContentEditable ||
            target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement),
        composing: event.isComposing,
        defaultPrevented: event.defaultPrevented,
      });
      if (key === undefined) return;
      const scopes = [
        ...(layout.modal.open ? [layout.modal] : []),
        layout.main,
        layout.side,
      ];
      const selector = `[data-hotkey="${CSS.escape(key)}"]:not(:disabled)`;
      for (const scope of scopes) {
        const field = scope.querySelector<HTMLElement>(selector);
        if (field === null) continue;
        event.preventDefault();
        field.focus();
        return;
      }
    });
  }

  /** Первая загрузка отказала: фиксированный текст и «Обновить»; в консоль — только строка. */
  private failed(layout: PageLayout): void {
    const { env } = this;
    env.log(CONSOLE_FAULT);
    layout.say(
      CLIENT_TEXTS.failed,
      h('button', {
        type: 'button',
        text: CLIENT_TEXTS.reload,
        click: () => env.reload(),
      }),
    );
  }
}
