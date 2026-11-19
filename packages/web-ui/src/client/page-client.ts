import { err, ok, type Result } from 'dmg-core';
import {
  type ActionField,
  type ActionOutcome,
  type Address,
  AddressCodec,
  type AddressJson,
  type InstanceView,
  type LocalOutcome,
  type OpenOptions,
  type ScreenInstance,
  ScreenRuntime,
  UiIds,
  type UnavailableReason,
} from 'dmg-ui';
import * as v from 'valibot';
import { PAGE_CHANNEL } from '../page-channel.const';
import { PageLayoutUrls } from '../url/page-layout-urls';
import { PageUrls } from '../url/page-urls';
import type {
  PageExpected,
  PageViewState,
} from '../view/page-view-state.types';
import type { ViewSource } from '../view/view-source.types';
import type { ServerMessage } from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import {
  PAGE_FAULTS,
  PAGE_HOME,
  PAGE_LINKED_REGIONS,
  PAGE_NOTES,
  PAGE_REGIONS,
  PAGE_ROOT_REGION,
  PAGE_TRANSIENT_REGIONS,
} from './page-client.const';
import type {
  DeferredOpen,
  PageClientSpec,
  PageClosableRegion,
  PageFormValues,
  PageInboxEntry,
  PageRegionName,
  PageSnapshot,
  RegionMarks,
} from './page-client.types';
import { PageForms } from './page-forms';
import { PageHistory } from './page-history';
import type { PageHistoryEntry } from './page-history.types';
import { PageHistoryRecord } from './page-history-record';
import { PageInbox } from './page-inbox';
import { PageOverlay } from './page-overlay';
import { PagePlacements } from './page-placements';
import { PageRegions } from './page-regions';
import { PageSystemClock } from './page-system-clock';
import { PageTraces } from './page-traces';
import { WirePorts } from './wire-ports';

export type {
  PageClientSpec,
  PageClosableRegion,
  PageFormValues,
  PageInboxEntry,
  PagePlacement,
  PageRegionName,
  PageSlotJson,
  PageSnapshot,
} from './page-client.types';

/** Снимок вкладки — внешние данные: области берутся как есть, их проверит `restore`. */
const SnapshotJson = v.record(v.string(), v.unknown());

/** Область снимка: адрес — для `loading` до ответа `restore`. */
const SlotAddress = v.object({ address: v.unknown() });

/** Действие области: экземпляр и вход, с которым его исполнить. */
type Act = {
  readonly instance: ScreenInstance;
  readonly action: string;
  readonly input: unknown;
  readonly revision: number;
  readonly confirmed: boolean;
  /** Введённое в форму (у жеста нет): для эха при отказе входа и повтора подтверждения. */
  readonly values?: PageFormValues;
  /** Ожидаемый итог: показан до ответа (D-UI-84). */
  readonly expected?: PageExpected;
};

/** Экземпляр области для действия или исход `unavailable`, если действовать нельзя. */
type Ready =
  | { readonly instance: ScreenInstance; readonly outcome?: undefined }
  | {
      readonly instance?: undefined;
      readonly outcome: Extract<ActionOutcome, { kind: 'unavailable' }>;
    };

/**
 * Вкладка одной личности — «браузерная» половина: исполнитель экранов здесь,
 * порты — поверх провода (`WirePorts`), сервер не виден. Сигналы — `route`,
 * `submit`, `confirm`, `local`, `openLink`, `retry`; исходы — по таблице
 * политик исходов (гайд `channel-package.md`); состояние области — `source`
 * (D-UI-70). Допущения: из двух открытий в область побеждает последнее
 * начатое; контекст рендера — из `hello` текущего соединения (D-UI-33). Без
 * связи переход ждёт соединения, действия отключены; после `attach` открытые
 * экземпляры перечитаны восстановлением из снимка (D-UI-74). С портом
 * истории переход — шаг, «Назад» и перезагрузка — путь по записи (D-UI-81).
 * Жест и «Да» показывают ожидаемый итог до ответа; пока он показан, действия
 * области недоступны (D-UI-84).
 * @see ./page-client.test.ts
 */
export class PageClient {
  private readonly spec: PageClientSpec;
  /** Текущий конец провода: его контекст — у новых экземпляров. */
  private end: ClientEnd;
  /** Переходы без связи — по одному на область, ждут `attach`. */
  private readonly deferred = new Map<PageRegionName, DeferredOpen>();
  private readonly runtime: ScreenRuntime;
  private readonly ports: WirePorts;
  private readonly traces: PageTraces;
  private readonly codec: AddressCodec;
  private readonly ids: UiIds;
  private readonly regions: PageRegions;
  /** Что видит человек: область с ожидаемыми итогами поверх (D-UI-84). */
  private readonly overlays = new Map<PageRegionName, PageOverlay>();
  private readonly forms = new PageForms();
  private readonly notes: PageInbox;
  /** Адрес входа `start` — куда вкладка возвращается. */
  private readonly start: Address;
  /** Кодек адреса `main` ↔ URL страницы по маршрутам приложения. */
  private readonly urls: PageUrls;
  /** Ссылка с составом областей: `urls` плюс вложенные адреса `PAGE_LINKED_REGIONS`. */
  private readonly layout: PageLayoutUrls;
  /** Записи истории вкладки; без порта истории нет. */
  private readonly history: PageHistory | undefined;

  /**
   * Приложение другого канала, нет входа `start` — ошибка сборки, бросок;
   * броски маршрутов и невыразимых в URL экранов — от `PageUrls`.
   */
  constructor(spec: PageClientSpec) {
    const { app, routes } = spec;
    if (app.channel !== PAGE_CHANNEL) {
      throw new Error(
        `PageClient: приложение ${app.name} канала ${app.channel}, а не ${PAGE_CHANNEL}`,
      );
    }
    const home = app.entries[PAGE_HOME];
    if (home === undefined) {
      throw new Error(
        `PageClient: у приложения ${app.name} нет входа ${PAGE_HOME}`,
      );
    }
    this.urls = new PageUrls({ app, routes });
    this.layout = new PageLayoutUrls(this.urls, PAGE_LINKED_REGIONS);
    this.ids = new UiIds(app.set);
    this.spec = spec;
    this.end = spec.end;
    this.start = home.address;
    this.traces = new PageTraces(
      spec.requestIds ?? (() => crypto.randomUUID()),
      PAGE_CHANNEL,
    );
    this.regions = new PageRegions(
      (node, error) => this.fault(node, error),
      new PagePlacements(this.ids, spec.placements ?? []),
    );
    for (const name of PAGE_REGIONS) {
      this.overlays.set(
        name,
        new PageOverlay(
          this.regions.source(name),
          (view, data) => this.expectedData(view, data),
          (node, error) => this.fault(node, error),
        ),
      );
    }
    this.ports = new WirePorts(spec.end, (address) =>
      this.regions.signalled(address),
    );
    this.runtime = new ScreenRuntime({
      set: app.set,
      codes: spec.codes,
      ucs: this.ports,
      refresh: this.ports,
      observer: spec.observer,
      app,
      ...(spec.faults === undefined ? {} : { faults: spec.faults }),
    });
    this.codec = new AddressCodec(app.set);
    this.notes = new PageInbox({
      ids: this.ids,
      observer: spec.observer,
      traces: this.traces,
      clock: spec.clock ?? new PageSystemClock(),
      onFault: (error) => this.fault(PAGE_CHANNEL, error),
    });
    this.listen(spec.end);
    this.history = this.recorded(spec);
  }

  /**
   * Первая загрузка и перезагрузка вкладки: области по текущей записи
   * истории тем же путём, что «Назад» (D-UI-81). Не шаг — начальная запись
   * заменяется. Без порта истории — бросок сборки привязки.
   */
  async boot(): Promise<void> {
    const port = this.spec.history;
    if (port === undefined) throw new Error('PageClient: нет порта истории');
    await this.revisit(port.current());
  }

  /**
   * Новый конец провода (переподключение, смена личности). Живой текущий
   * закрыт первым — вкладка «без связи»; затем отложенные переходы открыты,
   * области прежнего соединения восстановлены из снимка. Промис — когда все
   * отработали; не отклоняется. При работающем `PageReconnector` — сначала
   * `follow(end, …)`, затем `attach`: иначе закрытие прежнего он примет за
   * обрыв и подменит конец своим.
   */
  async attach(end: ClientEnd): Promise<void> {
    if (this.regions.connected) {
      const previous = this.end;
      previous.close();
      this.disconnected(previous);
    }
    this.bind(end);
    // Новый конец оборвался ещё до подписки — вкладка снова без связи.
    if (!this.regions.connected) return;
    const work: Promise<void>[] = [];
    for (const region of PAGE_REGIONS) {
      const deferred = this.deferred.get(region);
      this.deferred.delete(region);
      if (deferred !== undefined) {
        work.push(
          this.load(
            region,
            deferred.ticket,
            deferred.address,
            deferred.json,
          ).then(deferred.resolve, deferred.reject),
        );
      } else if (this.regions.behind(region)) {
        work.push(this.resync(region));
      }
    }
    await Promise.allSettled(work);
  }

  /**
   * Входящие вкладки — источник вида: уведомления по порядку прихода, один
   * объект на всю жизнь вкладки; новое уведомление — новый массив.
   */
  inbox(): ViewSource<readonly PageInboxEntry[]> {
    return this.notes.source;
  }

  /**
   * URL страницы (путь, строка запроса) → адрес в `main` и области из
   * резервных ключей; неразборчивый — вход `start` с заметкой, без URL и
   * причины в заметке (D-UI-76); неразборчивое значение области — пуста с
   * заметкой; областей вне ссылки не касается. Открытия параллельно; отказ —
   * только если не загрузился код экрана (первой причиной, после всех). Шаг
   * истории: ссылка внутри страницы; первая загрузка — `boot`.
   */
  route(url: string): Promise<void> {
    return this.step(() => this.routed(url));
  }

  /**
   * Ссылка на текущие области: `main` и области из `PAGE_LINKED_REGIONS`;
   * пустая `main` или невыразимый в URL адрес — `undefined`.
   */
  url(): string | undefined {
    const main = this.addressOf(PAGE_ROOT_REGION);
    if (main === undefined) return undefined;
    const regions: Record<string, Address | undefined> = {};
    for (const name of PAGE_LINKED_REGIONS) {
      regions[name] = this.addressOf(name);
    }
    return this.layout.url(main, regions);
  }

  /** Закрыть `side` или `modal`: пусто без заметки, экземпляр и подписка сняты. */
  close(region: PageClosableRegion): void {
    void this.step(() => this.clear(region));
  }

  /**
   * Форма действия области: все поля разом, один `act`. `revision` — вида,
   * по которому заполнена форма; по умолчанию — текущая.
   */
  async submit(
    region: PageRegionName,
    action: string,
    values: PageFormValues,
    revision?: number,
  ): Promise<ActionOutcome> {
    const ready = this.acting(region);
    if (ready.instance === undefined) return ready.outcome;
    const { instance } = ready;
    const view = instance.view();
    const fields = view.actions.find((a) => a.name === action)?.fields ?? [];
    return this.act(region, {
      instance,
      action,
      input: this.forms.input(fields, values),
      revision: revision ?? view.revision,
      confirmed: false,
      values: PageClient.declared(fields, values),
    });
  }

  /**
   * Жест: готовый вход действия, минуя сборку из строк формы (значение
   * варианта, не подпись). Ревизия обязательна — вида, по которому нарисована
   * цель жеста; устаревшая — исход `stale`. Наличие и доступность действия,
   * подтверждение и схему входа проверяет ядро; исход — по общей таблице.
   * `expected` — ожидаемый итог: показан до ответа (D-UI-84).
   */
  async submitInput(
    region: PageRegionName,
    action: string,
    input: unknown,
    revision: number,
    expected?: PageExpected,
  ): Promise<ActionOutcome> {
    const ready = this.acting(region);
    if (ready.instance === undefined) return ready.outcome;
    return this.act(region, {
      instance: ready.instance,
      action,
      input,
      revision,
      confirmed: false,
      ...(expected === undefined ? {} : { expected }),
    });
  }

  /**
   * «Да» ожидающему подтверждению области: тот же вход с `confirmed: true`;
   * `expected` — ожидаемый итог, показан до ответа (D-UI-84).
   */
  async confirm(
    region: PageRegionName,
    expected?: PageExpected,
  ): Promise<ActionOutcome> {
    const instance = this.regions.instance(region);
    const pending = this.regions.pending(region);
    if (instance === undefined) return this.unavailable(region, 'closed');
    if (
      pending === undefined ||
      this.regions.behind(region) ||
      this.overlay(region).expecting()
    ) {
      return this.unavailable(region, 'disabled');
    }
    return this.act(region, {
      instance,
      action: pending.action,
      input: pending.input,
      revision: pending.revision,
      confirmed: true,
      ...(pending.values === undefined ? {} : { values: pending.values }),
      ...(expected === undefined ? {} : { expected }),
    });
  }

  /** Форма локального действия: новое состояние без вызова на сервер. */
  async local(
    region: PageRegionName,
    name: string,
    values: PageFormValues,
  ): Promise<LocalOutcome> {
    const ready = this.ready(region);
    if (ready.instance === undefined) return ready.outcome;
    const { instance } = ready;
    const fields =
      instance.view().locals.find((l) => l.name === name)?.fields ?? [];
    const outcome = await instance.local({
      name,
      input: this.forms.input(fields, values),
    });
    switch (outcome.kind) {
      case 'changed':
        this.regions.mark(region, {});
        break;
      case 'rejected':
        this.regions.mark(region, {
          issues: outcome.issues,
          entered: {
            kind: 'local',
            name,
            values: PageClient.declared(fields, values),
          },
        });
        break;
      case 'refused':
        this.regions.mark(region, { note: outcome.refusal.text });
        break;
      case 'unavailable':
        this.regions.mark(region, { note: PageClient.note(outcome.reason) });
        break;
      default:
        PageClient.unknown(outcome);
    }
    return outcome;
  }

  /** Ссылка уведомления (внешние данные) — по размещению экрана; не декодируется — заметка. */
  openLink(address: AddressJson): Promise<void> {
    return this.step(() =>
      this.openJson(this.regions.target(undefined, address.screen), address),
    );
  }

  /** «Повторить»: тот же адрес области открывается заново. */
  async retry(region: PageRegionName): Promise<void> {
    const address = this.regions.instance(region)?.view().address;
    if (address !== undefined) await this.openJson(region, address);
  }

  /**
   * Источник состояния области — один объект на всё время жизни вкладки:
   * что видит человек, с ожидаемыми итогами поверх (D-UI-84).
   */
  source(name: PageRegionName): ViewSource<PageViewState> {
    return this.overlay(name);
  }

  /** Текущее состояние области — `source(name).get()`. */
  region(name: PageRegionName): PageViewState {
    return this.overlay(name).get();
  }

  /** Снимок областей с экземпляром в форме JSON. */
  snapshot(): PageSnapshot {
    return this.regions.snapshot();
  }

  /**
   * Восстановление вкладки из снимка (внешние данные): область с
   * декодируемым адресом — `loading` до ответа `restore`; мусор или
   * невосстановленный адрес `main` — вход `start` общим путём перехода (без
   * связи он ждёт соединения); невосстановленная прочая область — пуста.
   * Допущение:
   * `resume` зовётся на живом конце при старте вкладки — начатый до `attach`
   * не перечитывается по новому концу.
   */
  async resume(json: unknown): Promise<void> {
    const parsed = v.safeParse(SnapshotJson, json);
    const slots = parsed.success ? parsed.output : {};
    const tickets = new Map<PageRegionName, number>();
    for (const name of PAGE_REGIONS) {
      const ticket = this.resuming(name, slots[name]);
      if (ticket !== undefined) tickets.set(name, ticket);
    }
    try {
      for (const name of PAGE_REGIONS) {
        const ticket = tickets.get(name);
        const restored =
          ticket === undefined ? undefined : await this.restore(slots[name]);
        if (ticket !== undefined && restored !== undefined) {
          this.regions.place(name, ticket, restored);
        } else if (name === PAGE_ROOT_REGION) {
          await this.open(name, this.start);
        } else if (ticket !== undefined) {
          this.clear(name);
        }
      }
    } catch (error) {
      // Отказ — вызывающему; области снимка в `loading` не остаются.
      for (const [name, ticket] of tickets) {
        this.regions.failed(name, ticket, { note: PAGE_NOTES.failed });
      }
      throw error;
    }
  }

  private async act(region: PageRegionName, act: Act): Promise<ActionOutcome> {
    // Сверка экземпляра явная: тот же адрес, открытый заново, начинает с той
    // же ревизии — по ревизии смену экземпляра не отличить.
    const withdraw =
      act.expected === undefined
        ? undefined
        : this.overlay(region).put(
            act.revision,
            act.expected,
            () => this.regions.instance(region) === act.instance,
          );
    let outcome: ActionOutcome;
    try {
      outcome = await act.instance.act({
        action: act.action,
        input: act.input,
        revision: act.revision,
        confirmed: act.confirmed,
        trace: this.traces.next(),
      });
    } finally {
      // Снятие до политики исхода: иначе отказ на миг показал бы итог вместе
      // с заметкой отказа.
      withdraw?.();
    }
    // Экземпляр ушёл из области (переход, очистка) — побеждает последнее
    // начатое: исход только вызывающему.
    if (this.regions.instance(region) === act.instance) {
      await this.settle(region, act, outcome);
    }
    return outcome;
  }

  /** Политика по исходу действия (таблица политик исходов в гайде `channel-package.md`). */
  private async settle(
    region: PageRegionName,
    act: Act,
    outcome: ActionOutcome,
  ): Promise<void> {
    switch (outcome.kind) {
      case 'moved':
        // Шаг — весь переход вместе с очисткой окна: уход из окна на тот же
        // адрес меняет адреса только очисткой, после открытия цели.
        await this.step(() => this.moved(region, act, outcome.address));
        return;
      case 'stayed':
        this.regions.mark(region, {});
        return;
      case 'exited':
        await this.step(() => this.exited(region, act.instance, outcome.exit));
        return;
      case 'confirm':
        this.regions.mark(region, {
          confirm: {
            action: act.action,
            label: outcome.label,
            description: outcome.description,
            input: act.input,
            revision: act.revision,
            ...(act.values === undefined ? {} : { values: act.values }),
          },
        });
        return;
      case 'rejected':
        this.regions.mark(region, {
          issues: outcome.issues,
          ...(act.values === undefined
            ? {}
            : {
                entered: {
                  kind: 'action',
                  name: act.action,
                  values: act.values,
                },
              }),
        });
        return;
      case 'refused':
        // Отказ из-за обрыва — не ошибка сервера: результат покажет
        // перечитывание по новому соединению.
        this.regions.mark(region, {
          note: this.regions.behind(region)
            ? PAGE_NOTES.interrupted
            : outcome.refusal.text,
        });
        return;
      case 'stale':
        // Вид уже на перечитанных данных — форма заново по нему.
        this.regions.mark(region, {
          note: PAGE_NOTES.stale,
          stale: 'revision',
        });
        return;
      case 'unavailable':
        this.regions.mark(region, { note: PageClient.note(outcome.reason) });
        return;
      default:
        PageClient.unknown(outcome);
    }
  }

  /** Переход по исходу: цель открыта, временная область после шага закрыта, если в ней всё ещё он. */
  private async moved(
    region: PageRegionName,
    act: Act,
    address: AddressJson,
  ): Promise<void> {
    const target = this.regions.target(region, address.screen);
    await this.openJson(target, address);
    if (target === region) return;
    if (!PAGE_TRANSIENT_REGIONS.includes(region)) {
      this.regions.mark(region, {});
    } else if (this.regions.instance(region) === act.instance) {
      this.clear(region);
    }
  }

  /** Выход: текст из `exits` Def; в корневой области — вход `start`, в прочих — пусто. */
  private async exited(
    region: PageRegionName,
    instance: ScreenInstance,
    exit: string,
  ): Promise<void> {
    const def = this.ids.findScreen(instance.view().screen);
    const note = def?.exits[exit]?.label ?? exit;
    if (region === PAGE_ROOT_REGION) {
      await this.open(region, this.start, { note });
    } else {
      this.clear(region, { note });
    }
  }

  /** Разбор URL и открытия `route` — работа его шага. */
  private async routed(url: string): Promise<void> {
    const parsed = this.layout.parse(url);
    if (!parsed.ok) {
      await this.open(PAGE_ROOT_REGION, this.start, {
        note: PAGE_NOTES.notFound,
      });
      return;
    }
    const { main, regions } = parsed.value;
    const work = [this.open(PAGE_ROOT_REGION, main)];
    for (const name of PAGE_LINKED_REGIONS) {
      const region = regions[name];
      if (region === undefined) continue;
      if (region.ok) work.push(this.open(name, region.value));
      else this.clear(name, { note: PAGE_NOTES.notFound });
    }
    const settled = await Promise.allSettled(work);
    for (const result of settled) {
      if (result.status === 'rejected') throw result.reason;
    }
  }

  /** Адрес из внешних данных (исход, ссылка, «Повторить»): не декодирован — заметка. */
  private async openJson(
    region: PageRegionName,
    json: AddressJson,
  ): Promise<void> {
    const address = this.codec.decode(json);
    if (!address.ok) {
      this.clear(region, { note: PAGE_NOTES.notFound });
      return;
    }
    await this.open(region, address.value);
  }

  /**
   * Прежний экземпляр снят до загрузки; опоздавший экземпляр `place` закроет.
   * Без связи открытие ждёт `attach`: ни кода экрана, ни вызовов. `json` —
   * снимок экземпляра того же адреса: восстановление вместо открытия.
   */
  private open(
    region: PageRegionName,
    address: Address,
    marks?: RegionMarks,
    json?: unknown,
  ): Promise<void> {
    this.displace(region);
    const ticket = this.regions.opening(
      region,
      this.codec.encode(address),
      marks,
    );
    if (this.regions.connected) {
      return this.load(region, ticket, address, json);
    }
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.deferred.set(region, {
      ticket,
      address,
      ...(json === undefined ? {} : { json }),
      resolve,
      reject,
    });
    return promise;
  }

  /**
   * Загрузка экземпляра открытия с жетоном `ticket` по текущему соединению.
   * Конец сменился, пока экземпляр грузился, — экземпляр помечен, как без
   * связи, и перечитан по текущему. Сравнивается конец, чей контекст взяло
   * открытие, а не конец чтения: чтение могло уйти уже по новому, но вид и
   * проверка действий (`readOnly`, заместитель) — с прежнего `hello`.
   * Снимок `json` не восстановился (ревизия, адрес) — открытие по адресу.
   */
  private async load(
    region: PageRegionName,
    ticket: number,
    address: Address,
    json?: unknown,
  ): Promise<void> {
    const end = this.end;
    let instance: ScreenInstance;
    try {
      instance =
        (json === undefined ? undefined : await this.restore(json)) ??
        (await this.runtime.open(address, this.options()));
    } catch (error) {
      // Отказ — вызывающему, как раньше; область в `loading` не остаётся.
      this.regions.failed(region, ticket, { note: PAGE_NOTES.failed });
      throw error;
    }
    const outdated = end !== this.end;
    this.regions.place(region, ticket, instance, outdated);
    if (
      outdated &&
      this.regions.connected &&
      this.regions.instance(region) === instance
    ) {
      await this.resync(region);
    }
  }

  /**
   * Область снимка до `restore`: адрес декодируется — `loading` и жетон;
   * иначе область пуста, восстанавливать нечего.
   */
  private resuming(region: PageRegionName, json: unknown): number | undefined {
    const address = this.slotAddress(json);
    if (address === undefined) {
      this.clear(region);
      return undefined;
    }
    this.displace(region);
    return this.regions.opening(region, this.codec.encode(address));
  }

  /** Адрес слота снимка (внешние данные); не по форме или не декодируется — `undefined`. */
  private slotAddress(json: unknown): Address | undefined {
    const slot = v.safeParse(SlotAddress, json);
    if (!slot.success) return undefined;
    const address = this.codec.decode(slot.output.address);
    return address.ok ? address.value : undefined;
  }

  /**
   * Переход по записи истории («Назад», «Вперёд», `boot`), D-UI-81: URL
   * главнее записи для `main` и областей ссылки; запись даёт состояние при
   * том же адресе и области вне ссылки; без цели — область закрыта.
   * Неразборчивый URL — вход `start` с заметкой. Не шаг и не даёт шагам
   * записей; отказ — как `route`.
   */
  private async revisit(entry: PageHistoryEntry): Promise<void> {
    let generation: number | undefined;
    try {
      generation = this.history?.traversing();
      const slots = PageHistoryRecord.read(entry.record);
      const parsed = this.layout.parse(entry.url);
      if (!parsed.ok) {
        for (const name of PAGE_REGIONS) {
          if (name !== PAGE_ROOT_REGION) this.clear(name);
        }
        await this.open(PAGE_ROOT_REGION, this.start, {
          note: PAGE_NOTES.notFound,
        });
        return;
      }
      const { main, regions } = parsed.value;
      const work: Promise<void>[] = [];
      for (const name of PAGE_REGIONS) {
        const named = name === PAGE_ROOT_REGION ? ok(main) : regions[name];
        if (named !== undefined && !named.ok) {
          this.clear(name, { note: PAGE_NOTES.notFound });
          continue;
        }
        const target = named?.value ?? this.slotAddress(slots[name]);
        if (target === undefined) this.clear(name);
        else work.push(this.reach(name, target, slots[name]));
      }
      const settled = await Promise.allSettled(work);
      for (const result of settled) {
        if (result.status === 'rejected') throw result.reason;
      }
    } finally {
      if (generation !== undefined) this.history?.traversed(generation);
    }
  }

  /**
   * Цель области при переходе по записи. Тот же адрес, что у живой (и
   * грузящейся), — не тронута: список не перечитывается и не теряет выбор.
   * Слот записи того же адреса — восстановление, иначе открытие с начала.
   */
  private reach(
    region: PageRegionName,
    target: Address,
    slot: unknown,
  ): Promise<void> {
    const key = JSON.stringify(this.codec.encode(target));
    if (JSON.stringify(this.regions.state(region).address) === key) {
      return Promise.resolve();
    }
    const recorded = this.slotAddress(slot);
    const same =
      recorded !== undefined &&
      JSON.stringify(this.codec.encode(recorded)) === key;
    return this.open(region, target, undefined, same ? slot : undefined);
  }

  /**
   * Перечитывание области без события: экземпляр восстанавливается из своего
   * снимка по текущему соединению (ядро подписывается раньше чтения), прежний
   * вид виден с `refreshing`. Переход во время восстановления побеждает.
   */
  private async resync(region: PageRegionName): Promise<void> {
    const instance = this.regions.instance(region);
    if (instance === undefined) return;
    const snapshot = instance.snapshot();
    const ticket = this.regions.resyncing(region);
    let restored: ScreenInstance | undefined;
    try {
      restored = await this.restore(snapshot);
    } catch {
      // Код экрана не загрузился — как отказ открытия (D-UI-70).
      restored = undefined;
    }
    if (restored === undefined) {
      // В диагностику — без данных: бросок мог нести снимок экземпляра.
      this.fault(PAGE_CHANNEL, new Error(PAGE_FAULTS.resync));
      this.regions.resyncFailed(region, ticket, { note: PAGE_NOTES.failed });
    } else {
      this.regions.replace(region, ticket, restored);
    }
  }

  /** Отложенный переход области вытеснен новым открытием или очисткой — его промис разрешён. */
  private displace(region: PageRegionName): void {
    const deferred = this.deferred.get(region);
    this.deferred.delete(region);
    deferred?.resolve();
  }

  /** Область пуста с отметками; отложенный переход в неё вытеснен. */
  private clear(region: PageRegionName, marks?: RegionMarks): void {
    this.displace(region);
    this.regions.clear(region, marks);
  }

  /**
   * Конец провода — текущим: порты на него, связь есть, сообщения и обрыв
   * сверяются с текущим концом. Порядок: порты раньше клиента — обрыв
   * отказывает вызовы до пометки областей.
   */
  private bind(end: ClientEnd): void {
    this.end = end;
    this.ports.attach(end);
    this.regions.connect();
    this.listen(end);
  }

  /** Подписка на сообщения и обрыв конца: прежний конец после смены — без действия. */
  private listen(end: ClientEnd): void {
    end.onMessage((message) =>
      end === this.end && this.regions.connected
        ? this.receive(message)
        : Promise.resolve(),
    );
    end.onBreak(() => this.disconnected(end));
  }

  /** Обрыв текущего конца: области — «без связи»; повтор и прежний конец — без действия. */
  private disconnected(end: ClientEnd): void {
    if (end !== this.end || !this.regions.connected) return;
    this.regions.disconnect();
  }

  private async restore(json: unknown): Promise<ScreenInstance | undefined> {
    const restored = await this.runtime.restore(json, this.options());
    return restored.ok ? restored.value : undefined;
  }

  /**
   * Сообщение сервера вкладке с промисом реакции, который ждёт провод в
   * памяти (D-UI-71). Сообщение уходит в порты, во входящие или никуда;
   * промис разрешается, когда экземпляры областей отработали реакцию
   * (`idle()`).
   */
  private receive(message: ServerMessage): Promise<void> {
    switch (message.kind) {
      case 'result':
      case 'signal':
      case 'watch-refused':
      case 'refused':
        this.ports.receive(message);
        return this.idle();
      case 'notification':
        this.notes.receive(message);
        return this.idle();
      case 'hello':
        // Контекст пришёл при соединении; повтор вид не меняет (D-UI-33).
        return this.idle();
      default:
        return PageClient.unknown(message);
    }
  }

  /** Экземпляры всех областей завершили работу (D-UI-49); не отклоняется. */
  private async idle(): Promise<void> {
    await Promise.allSettled(
      PAGE_REGIONS.map((name) => this.regions.instance(name)?.settled()),
    );
  }

  /**
   * Экземпляр области для действия формы или жеста; нет экземпляра или данные
   * с прежнего соединения — исход `unavailable` (с заметкой области).
   */
  private ready(region: PageRegionName): Ready {
    const instance = this.regions.instance(region);
    if (instance === undefined) {
      return { outcome: this.unavailable(region, 'closed') };
    }
    if (this.regions.behind(region)) {
      return { outcome: this.unavailable(region, 'disabled') };
    }
    return { instance };
  }

  /**
   * Экземпляр области для действия на сервер: как `ready`, и пока показан
   * ожидаемый итог — `unavailable: 'disabled'` (D-UI-84). Локальных
   * действий это не касается: они без ревизии и на сервер не идут.
   */
  private acting(region: PageRegionName): Ready {
    const ready = this.ready(region);
    if (ready.instance !== undefined && this.overlay(region).expecting()) {
      return { outcome: this.unavailable(region, 'disabled') };
    }
    return ready;
  }

  /** Наложение ожидаемых итогов области. */
  private overlay(name: PageRegionName): PageOverlay {
    const overlay = this.overlays.get(name);
    if (overlay === undefined) {
      throw new Error(`PageClient: нет области ${name}`);
    }
    return overlay;
  }

  /**
   * Ожидаемый итог — по схеме данных экрана: в вид идёт её выход, потому что
   * представление приводит данные к типу экрана без проверки.
   */
  private expectedData(
    view: InstanceView,
    data: unknown,
  ): Result<unknown, void> {
    const schema = this.ids.findScreen(view.screen)?.data;
    if (schema === undefined) return err(undefined);
    const parsed = v.safeParse(schema, data);
    return parsed.success ? ok(parsed.output) : err(undefined);
  }

  /** Адрес области как `Address`; пустая область — `undefined`. */
  private addressOf(region: PageRegionName): Address | undefined {
    const json = this.regions.state(region).address;
    if (json === undefined) return undefined;
    const address = this.codec.decode(json);
    return address.ok ? address.value : undefined;
  }

  /**
   * Действия нет: исход `unavailable` без исполнителя и заметка области;
   * у области в `loading` отметки открытия остаются — они для нового экрана.
   */
  private unavailable(
    region: PageRegionName,
    reason: UnavailableReason,
  ): Extract<ActionOutcome, { kind: 'unavailable' }> {
    if (this.regions.state(region).status !== 'loading') {
      this.regions.mark(region, { note: PageClient.note(reason) });
    }
    return { kind: 'unavailable', reason };
  }

  /** Работа перехода — шагом истории, если порт задан; без порта — как есть. */
  private step(work: () => Promise<void> | void): Promise<void> {
    return this.history?.step(work) ?? Promise.resolve(work());
  }

  /**
   * История поверх порта сборки: подписка на три области и на переходы по
   * записи. Сбой порта — в `faults` фиксированным текстом: бросок браузера
   * несёт URL с параметрами людей.
   */
  private recorded(spec: PageClientSpec): PageHistory | undefined {
    const port = spec.history;
    if (port === undefined) return undefined;
    const history = new PageHistory(
      port,
      {
        url: () => this.url(),
        snapshot: () => this.snapshot(),
        places: () => this.places(),
        loading: () =>
          PAGE_REGIONS.some(
            (name) => this.regions.state(name).status === 'loading',
          ),
      },
      () => this.fault(PAGE_CHANNEL, new Error(PAGE_FAULTS.history)),
    );
    for (const name of PAGE_REGIONS) {
      this.regions.source(name).subscribe(() => history.changed());
    }
    // Отказ перехода по записи ловить некому (его начал браузер): в
    // диагностику как есть — это отказ загрузки кода экрана.
    port.onTraverse((entry) =>
      this.revisit(entry).catch((error: unknown) =>
        this.fault(PAGE_CHANNEL, error),
      ),
    );
    return history;
  }

  /** Адрес каждой непустой области JSON-строкой, в том числе грузящейся. */
  private places(): Record<string, string> {
    const places: Record<string, string> = {};
    for (const name of PAGE_REGIONS) {
      const address = this.regions.state(name).address;
      if (address !== undefined) places[name] = JSON.stringify(address);
    }
    return places;
  }

  /** Бросок слушателя ячейки области — в точку диагностики; её бросок гасится. */
  private fault(node: string, error: unknown): void {
    try {
      this.spec.faults?.({ node, trace: this.traces.next(), error });
    } catch {
      // Диагностика не рвёт сигнал вкладки: сообщить о её сбое некуда.
    }
  }

  private options(): OpenOptions {
    return { context: this.end.context, trace: this.traces.next() };
  }

  /** Значения только объявленных полей формы: чужие ключи отброшены. */
  private static declared(
    fields: readonly ActionField[],
    values: PageFormValues,
  ): PageFormValues {
    const declared: Record<string, string> = {};
    for (const field of fields) {
      const value = values[field.name];
      if (value !== undefined) declared[field.name] = value;
    }
    return declared;
  }

  private static note(reason: UnavailableReason): string {
    switch (reason) {
      case 'unknown':
      case 'disabled':
        return PAGE_NOTES.unavailable;
      case 'readOnly':
        return PAGE_NOTES.readOnly;
      case 'closed':
        return PAGE_NOTES.closed;
      default:
        return PageClient.unknown(reason);
    }
  }

  /** Значение, которого не знает `switch` (новое в ядре), — дефект канала, бросок (ERR-06). */
  private static unknown(value: never): never {
    throw new Error(
      `PageClient: неизвестное значение ${JSON.stringify(value)}`,
    );
  }
}
