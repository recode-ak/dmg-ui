import {
  type ActionOutcome,
  type Address,
  AddressCodec,
  type AddressJson,
  type LocalOutcome,
  type OpenOptions,
  type ScreenInstance,
  ScreenRuntime,
  UiIds,
  type UnavailableReason,
} from 'dmg-ui';
import * as v from 'valibot';
import { PAGE_CHANNEL } from '../page-channel.const';
import type { PageViewState } from '../view/page-view-state.types';
import type { ViewSource } from '../view/view-source.types';
import type { ServerMessage } from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import {
  PAGE_FAULTS,
  PAGE_HOME,
  PAGE_NOTES,
  PAGE_REGIONS,
} from './page-client.const';
import type {
  DeferredOpen,
  PageClientSpec,
  PageFormValues,
  PageInboxEntry,
  PageRegionName,
  PageSnapshot,
  RegionMarks,
} from './page-client.types';
import { PageForms } from './page-forms';
import { PageInbox } from './page-inbox';
import { PageRegions } from './page-regions';
import { PageSystemClock } from './page-system-clock';
import { PageTraces } from './page-traces';
import { WirePorts } from './wire-ports';

export type {
  PageClientSpec,
  PageFormValues,
  PageInboxEntry,
  PageRegionName,
  PageRoute,
  PageSlotJson,
  PageSnapshot,
} from './page-client.types';

/** Снимок вкладки — внешние данные: области берутся как есть, их проверит `restore`. */
const SnapshotJson = v.object({
  main: v.optional(v.unknown()),
  side: v.optional(v.unknown()),
});

/** Область снимка: адрес — для `loading` до ответа `restore`. */
const SlotAddress = v.object({ address: v.unknown() });

/** Действие области: экземпляр и вход, с которым его исполнить. */
type Act = {
  readonly instance: ScreenInstance;
  readonly action: string;
  readonly input: unknown;
  readonly revision: number;
  readonly confirmed: boolean;
};

/**
 * Вкладка одной личности — «браузерная» половина: исполнитель экранов здесь,
 * порты — поверх провода (`WirePorts`), сервер не виден. Сигналы — `route`,
 * `submit`, `confirm`, `local`, `openLink`, `retry`; исходы — по таблице
 * политик исходов (гайд `channel-package.md`); состояние области — `source`
 * (D-UI-70). Допущения: из двух открытий в область побеждает последнее
 * начатое; контекст рендера — из `hello` текущего соединения (D-UI-33). Без
 * связи переход ждёт соединения, действия отключены; после `attach` открытые
 * экземпляры перечитаны восстановлением из снимка (D-UI-74).
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
  private readonly forms = new PageForms();
  private readonly notes: PageInbox;
  /** Адрес входа `start` — куда вкладка возвращается. */
  private readonly start: Address;

  /**
   * Приложение другого канала, нет входа `start`, маршрут на необъявленный
   * вход или повтор пути — ошибка сборки, бросок.
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
    const paths = new Set<string>();
    for (const route of routes) {
      if (app.entries[route.entry] === undefined) {
        throw new Error(
          `PageClient: маршрут ${route.path} ведёт на вход ${route.entry}, которого нет у приложения ${app.name}`,
        );
      }
      if (paths.has(route.path)) {
        throw new Error(`PageClient: два маршрута с путём ${route.path}`);
      }
      paths.add(route.path);
    }
    this.spec = spec;
    this.end = spec.end;
    this.start = home.address;
    this.traces = new PageTraces(
      spec.requestIds ?? (() => crypto.randomUUID()),
      PAGE_CHANNEL,
    );
    this.regions = new PageRegions((node, error) => this.fault(node, error));
    this.ports = new WirePorts(spec.end, (address) =>
      this.regions.signalled(address),
    );
    this.runtime = new ScreenRuntime({
      set: app.set,
      codes: spec.codes,
      ucs: this.ports,
      refresh: this.ports,
      observer: spec.observer,
      ...(spec.faults === undefined ? {} : { faults: spec.faults }),
    });
    this.codec = new AddressCodec(app.set);
    this.ids = new UiIds(app.set);
    this.notes = new PageInbox({
      ids: this.ids,
      observer: spec.observer,
      traces: this.traces,
      clock: spec.clock ?? new PageSystemClock(),
      onFault: (error) => this.fault(PAGE_CHANNEL, error),
    });
    this.listen(spec.end);
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
          this.load(region, deferred.ticket, deferred.address).then(
            deferred.resolve,
            deferred.reject,
          ),
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

  /** Путь страницы → вход маршрута в `main`; неизвестный путь — заметка. */
  async route(path: string): Promise<void> {
    const route = this.spec.routes.find((r) => r.path === path);
    const entry =
      route === undefined ? undefined : this.spec.app.entries[route.entry];
    if (entry === undefined) {
      this.clear('main', { note: PAGE_NOTES.notFound });
      return;
    }
    await this.open('main', entry.address);
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
    const instance = this.regions.instance(region);
    if (instance === undefined) return this.unavailable(region, 'closed');
    if (this.regions.behind(region)) {
      return this.unavailable(region, 'disabled');
    }
    const view = instance.view();
    const fields = view.actions.find((a) => a.name === action)?.fields ?? [];
    return this.act(region, {
      instance,
      action,
      input: this.forms.input(fields, values),
      revision: revision ?? view.revision,
      confirmed: false,
    });
  }

  /** «Да» ожидающему подтверждению области: тот же вход с `confirmed: true`. */
  async confirm(region: PageRegionName): Promise<ActionOutcome> {
    const instance = this.regions.instance(region);
    const pending = this.regions.pending(region);
    if (instance === undefined) return this.unavailable(region, 'closed');
    if (pending === undefined || this.regions.behind(region)) {
      return this.unavailable(region, 'disabled');
    }
    return this.act(region, {
      instance,
      action: pending.action,
      input: pending.input,
      revision: pending.revision,
      confirmed: true,
    });
  }

  /** Форма локального действия: новое состояние без вызова на сервер. */
  async local(
    region: PageRegionName,
    name: string,
    values: PageFormValues,
  ): Promise<LocalOutcome> {
    const instance = this.regions.instance(region);
    if (instance === undefined) return this.unavailable(region, 'closed');
    if (this.regions.behind(region)) {
      return this.unavailable(region, 'disabled');
    }
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
        this.regions.mark(region, { issues: outcome.issues });
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

  /** Ссылка уведомления (внешние данные) — в `side`; не декодируется — заметка. */
  openLink(address: AddressJson): Promise<void> {
    return this.openJson('side', address);
  }

  /** «Повторить»: тот же адрес области открывается заново. */
  async retry(region: PageRegionName): Promise<void> {
    const address = this.regions.instance(region)?.view().address;
    if (address !== undefined) await this.openJson(region, address);
  }

  /** Источник состояния области — один объект на всё время жизни вкладки. */
  source(name: PageRegionName): ViewSource<PageViewState> {
    return this.regions.source(name);
  }

  /** Текущее состояние области — `source(name).get()`. */
  region(name: PageRegionName): PageViewState {
    return this.regions.state(name);
  }

  /** Снимок обеих областей в форме JSON. */
  snapshot(): PageSnapshot {
    return this.regions.snapshot();
  }

  /**
   * Восстановление вкладки из снимка (внешние данные): область с
   * декодируемым адресом — `loading` до ответа `restore`; мусор или
   * невосстановленный адрес `main` — вход `start` общим путём перехода (без
   * связи он ждёт соединения); невосстановленная `side` — пуста. Допущение:
   * `resume` зовётся на живом конце при старте вкладки — начатый до `attach`
   * не перечитывается по новому концу.
   */
  async resume(json: unknown): Promise<void> {
    const parsed = v.safeParse(SnapshotJson, json);
    const slots = parsed.success ? parsed.output : {};
    const main = this.resuming('main', slots.main);
    const side = this.resuming('side', slots.side);
    try {
      const restoredMain =
        main === undefined ? undefined : await this.restore(slots.main);
      if (main === undefined || restoredMain === undefined) {
        await this.open('main', this.start);
      } else {
        this.regions.place('main', main, restoredMain);
      }
      if (side === undefined) return;
      const restoredSide = await this.restore(slots.side);
      if (restoredSide === undefined) this.clear('side');
      else this.regions.place('side', side, restoredSide);
    } catch (error) {
      // Отказ — вызывающему; области снимка в `loading` не остаются.
      this.regions.failed('main', main, { note: PAGE_NOTES.failed });
      this.regions.failed('side', side, { note: PAGE_NOTES.failed });
      throw error;
    }
  }

  private async act(region: PageRegionName, act: Act): Promise<ActionOutcome> {
    const outcome = await act.instance.act({
      action: act.action,
      input: act.input,
      revision: act.revision,
      confirmed: act.confirmed,
      trace: this.traces.next(),
    });
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
      case 'moved': {
        const target = this.regions.target(region, outcome.address.screen);
        await this.openJson(target, outcome.address);
        if (target !== region) this.regions.mark(region, {});
        return;
      }
      case 'stayed':
        this.regions.mark(region, {});
        return;
      case 'exited':
        await this.exited(region, act.instance, outcome.exit);
        return;
      case 'confirm':
        this.regions.mark(region, {
          confirm: {
            action: act.action,
            label: outcome.label,
            description: outcome.description,
            input: act.input,
            revision: act.revision,
          },
        });
        return;
      case 'rejected':
        this.regions.mark(region, { issues: outcome.issues });
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

  /** Выход: текст из `exits` Def; в `main` — вход `start`, в `side` — пусто. */
  private async exited(
    region: PageRegionName,
    instance: ScreenInstance,
    exit: string,
  ): Promise<void> {
    const def = this.ids.findScreen(instance.view().screen);
    const note = def?.exits[exit]?.label ?? exit;
    if (region === 'main') await this.open('main', this.start, { note });
    else this.clear(region, { note });
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
   * Без связи открытие ждёт `attach`: ни кода экрана, ни вызовов.
   */
  private open(
    region: PageRegionName,
    address: Address,
    marks?: RegionMarks,
  ): Promise<void> {
    this.displace(region);
    const ticket = this.regions.opening(
      region,
      this.codec.encode(address),
      marks,
    );
    if (this.regions.connected) return this.load(region, ticket, address);
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.deferred.set(region, { ticket, address, resolve, reject });
    return promise;
  }

  /**
   * Загрузка экземпляра открытия с жетоном `ticket` по текущему соединению.
   * Конец сменился, пока экземпляр грузился, — экземпляр помечен, как без
   * связи, и перечитан по текущему. Сравнивается конец, чей контекст взяло
   * открытие, а не конец чтения: чтение могло уйти уже по новому, но вид и
   * проверка действий (`readOnly`, заместитель) — с прежнего `hello`.
   */
  private async load(
    region: PageRegionName,
    ticket: number,
    address: Address,
  ): Promise<void> {
    const end = this.end;
    let instance: ScreenInstance;
    try {
      instance = await this.runtime.open(address, this.options());
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
    const slot = v.safeParse(SlotAddress, json);
    const address = slot.success
      ? this.codec.decode(slot.output.address)
      : undefined;
    if (address?.ok !== true) {
      this.clear(region);
      return undefined;
    }
    this.displace(region);
    return this.regions.opening(region, this.codec.encode(address.value));
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

  /** Экземпляры обеих областей завершили работу (D-UI-49); не отклоняется. */
  private async idle(): Promise<void> {
    await Promise.allSettled([
      this.regions.instance('main')?.settled(),
      this.regions.instance('side')?.settled(),
    ]);
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
