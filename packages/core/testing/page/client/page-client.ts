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
import type { ServerMessage } from '../wire/page-messages.types';
import { PAGE_HOME, PAGE_NOTES } from './page-client.const';
import type {
  PageClientSpec,
  PageFormValues,
  PageInboxEntry,
  PageRegionName,
  PageRegionView,
  PageSnapshot,
  RegionMarks,
} from './page-client.types';
import { PageForms } from './page-forms';
import { PageInbox } from './page-inbox';
import { PageRegions } from './page-regions';
import { PageRenderer } from './page-renderer';
import { PageTraces } from './page-traces';
import { WirePorts } from './wire-ports';

export type {
  PageClientSpec,
  PageConfirm,
  PageFormValues,
  PageInboxEntry,
  PageRegionName,
  PageRegionView,
  PageRoute,
  PageSlotJson,
  PageSnapshot,
} from './page-client.types';

/** Снимок вкладки — внешние данные: области берутся как есть, их проверит `restore`. */
const SnapshotJson = v.object({
  main: v.optional(v.unknown()),
  side: v.optional(v.unknown()),
});

/** Действие области: экземпляр и вход, с которым его исполнить. */
type Act = {
  readonly instance: ScreenInstance;
  readonly action: string;
  readonly input: unknown;
  readonly revision: number;
  readonly confirmed: boolean;
};

/**
 * Вкладка страничного канала одной личности — «браузерная» половина.
 * Исполнитель экранов (`ScreenRuntime`, код экранов) живёт здесь, порты
 * исполнителя — поверх провода (`WirePorts`); сервер вкладке не виден.
 * Входящие сигналы — `route`, `submit`, `confirm`, `local`, `openLink`,
 * `retry`; исходы ядра разбираются по таблице политик (бриф Ф6, раздел 1).
 *
 * Допущения учебного канала:
 * - сигналы вкладки сериализует вызывающий: два параллельных открытия в
 *   одну область — последняя завершившаяся побеждает;
 * - контекст рендера — из `hello` на всё соединение (Т-7).
 */
export class PageClient {
  private readonly spec: PageClientSpec;
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
   * Приложение другого канала, представления другого набора, нет входа `start`, маршрут на
   * необъявленный вход или повтор пути — ошибка сборки, бросок.
   */
  constructor(spec: PageClientSpec) {
    const { app, views, routes } = spec;
    if (app.channel !== PAGE_CHANNEL) {
      throw new Error(
        `PageClient: приложение ${app.name} канала ${app.channel}, а не ${PAGE_CHANNEL}`,
      );
    }
    if (views.set !== app.set) {
      throw new Error(
        `PageClient: представления набора ${views.set.name}, а приложение — ${app.set.name}`,
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
    this.start = home.address;
    this.ports = new WirePorts(spec.end);
    this.runtime = new ScreenRuntime({
      set: app.set,
      codes: spec.codes,
      ucs: this.ports,
      refresh: this.ports,
      observer: spec.observer,
    });
    this.traces = new PageTraces(
      spec.requestIds ?? (() => crypto.randomUUID()),
      PAGE_CHANNEL,
    );
    this.codec = new AddressCodec(app.set);
    this.ids = new UiIds(app.set);
    this.regions = new PageRegions(new PageRenderer(views));
    this.notes = new PageInbox(views);
    spec.end.onMessage((message) => this.receive(message));
  }

  /** Уведомления вкладки по порядку прихода. */
  get inbox(): readonly PageInboxEntry[] {
    return this.notes.list;
  }

  /** Путь страницы → вход маршрута в `main`; неизвестный путь — заметка. */
  async route(path: string): Promise<void> {
    const route = this.spec.routes.find((r) => r.path === path);
    const entry =
      route === undefined ? undefined : this.spec.app.entries[route.entry];
    if (entry === undefined) {
      this.regions.clear('main', { note: PAGE_NOTES.notFound });
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
    if (pending === undefined) return this.unavailable(region, 'disabled');
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

  region(name: PageRegionName): PageRegionView {
    return this.regions.view(name);
  }

  /** Текст страницы: обе области и входящие. */
  page(): string {
    return [this.regions.text(), this.notes.text(PAGE_NOTES.inbox)]
      .filter((part) => part !== undefined && part !== '')
      .join('\n\n---\n\n');
  }

  /** Снимок обеих областей в форме JSON (Т-15). */
  snapshot(): PageSnapshot {
    return this.regions.snapshot();
  }

  /**
   * Восстановление вкладки из снимка (внешние данные): мусор или
   * невосстановленный адрес `main` — вход `start`; невосстановленная
   * `side` — пуста.
   */
  async resume(json: unknown): Promise<void> {
    const parsed = v.safeParse(SnapshotJson, json);
    const slots = parsed.success ? parsed.output : {};
    this.regions.clear('main');
    this.regions.clear('side');
    const main = await this.restore(slots.main);
    if (main === undefined) await this.open('main', this.start);
    else this.regions.place('main', main);
    const side = await this.restore(slots.side);
    if (side !== undefined) this.regions.place('side', side);
  }

  private async act(region: PageRegionName, act: Act): Promise<ActionOutcome> {
    const outcome = await act.instance.act({
      action: act.action,
      input: act.input,
      revision: act.revision,
      confirmed: act.confirmed,
      trace: this.traces.next(),
    });
    await this.settle(region, act, outcome);
    return outcome;
  }

  /** Политика по исходу действия (таблица брифа Ф6, раздел 1). */
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
        this.regions.mark(region, { note: outcome.refusal.text });
        return;
      case 'stale':
        // Вид уже на перечитанных данных — форма заново по нему (design §4).
        this.regions.mark(region, { note: PAGE_NOTES.stale });
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
    else this.regions.clear(region, { note });
  }

  /** Адрес из внешних данных (исход, ссылка, «Повторить»): не декодирован — заметка. */
  private async openJson(
    region: PageRegionName,
    json: AddressJson,
  ): Promise<void> {
    const address = this.codec.decode(json);
    if (!address.ok) {
      this.regions.clear(region, { note: PAGE_NOTES.notFound });
      return;
    }
    await this.open(region, address.value);
  }

  private async open(
    region: PageRegionName,
    address: Address,
    marks?: RegionMarks,
  ): Promise<void> {
    const instance = await this.runtime.open(address, this.options());
    this.regions.place(region, instance, marks);
  }

  private async restore(json: unknown): Promise<ScreenInstance | undefined> {
    if (json === undefined) return undefined;
    const restored = await this.runtime.restore(json, this.options());
    return restored.ok ? restored.value : undefined;
  }

  /** Сообщение сервера вкладке: порты, входящие или ничего. */
  private receive(message: ServerMessage): void {
    switch (message.kind) {
      case 'result':
      case 'signal':
      case 'watch-refused':
        this.ports.receive(message);
        return;
      case 'notification':
        this.notes.receive(message);
        return;
      case 'hello':
        // Контекст пришёл при соединении; повтор вид не меняет (Т-7).
        return;
      case 'refused':
        // Ответ на сообщение не по схеме: клиент шлёт только по схеме
        // (`WirePorts`), а `id` в отказе нет — сопоставить не с чем.
        return;
      default:
        PageClient.unknown(message);
    }
  }

  /** Действия нет: исход `unavailable` без исполнителя и заметка области. */
  private unavailable(
    region: PageRegionName,
    reason: UnavailableReason,
  ): Extract<ActionOutcome, { kind: 'unavailable' }> {
    this.regions.mark(region, { note: PageClient.note(reason) });
    return { kind: 'unavailable', reason };
  }

  private options(): OpenOptions {
    return { context: this.spec.end.context, trace: this.traces.next() };
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
