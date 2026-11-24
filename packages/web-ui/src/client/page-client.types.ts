import type { ReviveSubject, SerializedResult } from 'dmg-core';
import type {
  Address,
  AddressJson,
  AnyScreenDef,
  AnyUiAppDef,
  AppCodeLoaders,
  FieldIssue,
  RefreshSignal,
  ScreenInstance,
  UiFault,
  UiIds,
  UiObserver,
} from 'dmg-ui';
import type { PageRoute } from '../url/page-urls.types';
import type { PageFormValues } from '../view/page-form.types';
import type {
  PageConfirm,
  PageEntered,
  PageStaleReason,
  PageViewState,
} from '../view/page-view-state.types';
import type {
  RefusedMessage,
  ResultMessage,
  SignalMessage,
  WatchRefusedMessage,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import type { PAGE_REGIONS, PAGE_ROOT_REGION } from './page-client.const';
import type { PageClock } from './page-clock.types';
import type { PageHistoryPort, PageStepPlace } from './page-history.types';
import type { PageTraces } from './page-traces';
import type { ViewCell } from './view-cell';

/** Области страницы: основная, соседняя и модальная — по перечню `PAGE_REGIONS`. */
export type PageRegionName = (typeof PAGE_REGIONS)[number];

/** Область, которую можно закрыть: корневая всегда с экраном. */
export type PageClosableRegion = Exclude<
  PageRegionName,
  typeof PAGE_ROOT_REGION
>;

/**
 * Объявление приложения страниц: переход на экран открывается в области.
 * Экран и приложение UI об областях не знают — решает канал.
 */
export type PagePlacement = {
  readonly screen: AnyScreenDef;
  readonly region: PageRegionName;
};

/**
 * Сборка вкладки: приложение UI, сборка его кода, маршруты (шаблоны пути — входы
 * приложения, D-UI-76) и клиентский конец провода. `UiServer` клиенту не
 * виден — только провод; представлений клиент не берёт — текст строит цель
 * показа.
 */
export type PageClientSpec = {
  readonly app: AnyUiAppDef;
  readonly codes: AppCodeLoaders;
  readonly routes: readonly PageRoute[];
  readonly end: ClientEnd;
  /** Куда открывать переходы на экраны; без объявления — по положению. */
  readonly placements?: readonly PagePlacement[];
  readonly observer: UiObserver;
  /** Часы срока отсева повторов; по умолчанию — `PageSystemClock`. */
  readonly clock?: PageClock;
  /** Id запросов следа; по умолчанию — `crypto.randomUUID`. */
  readonly requestIds?: () => string;
  /** Сырые броски кода экранов и слушателей вида — для диагностики. */
  readonly faults?: (fault: UiFault) => void;
  /** История вкладки: шаги, «Назад», перезагрузка (D-UI-81); без порта истории нет. */
  readonly history?: PageHistoryPort;
  /**
   * Правило шага приложения (D-UI-104): ключ места по адресу корня — смена
   * ключа даёт новую запись истории. По умолчанию — экран корня (D-UI-97).
   */
  readonly stepPlace?: PageStepPlace;
  /**
   * Субъект проекта из JSON `hello.context.subject` (пара `subjectToWire`
   * сервера, D-46, D-UI-99): зовётся один раз на соединение. Бросок —
   * субъекта нет (действия по правам кода экрана скрыты), запись в `faults`.
   * Без порта субъекта у кода нет.
   */
  readonly reviveSubject?: ReviveSubject<unknown>;
};

export type { PageFormValues };

/**
 * Подтверждение с тем, что нужно для повтора входа с `confirmed: true`;
 * `values` — введённое в форму (у жеста нет), для эха при отказе входа.
 */
export type PendingConfirm = PageConfirm & {
  readonly input: unknown;
  readonly revision: number;
  readonly values?: PageFormValues;
};

/** Отметки области после сигнала: заметка, замечания и введённое, подтверждение, устаревание. */
export type RegionMarks = {
  readonly note?: string;
  readonly issues?: readonly FieldIssue[];
  readonly confirm?: PendingConfirm;
  readonly entered?: PageEntered;
  readonly stale?: PageStaleReason;
};

/**
 * Одна область: ячейка состояния, живой экземпляр и отписка его `onChange`,
 * отметки, адрес идущего открытия, жетоны открытия, перечитывания и
 * восстановления, признак «данные с прежнего соединения».
 */
export type RegionSlot = {
  readonly cell: ViewCell<PageViewState>;
  instance: ScreenInstance | undefined;
  unlisten: (() => void) | undefined;
  marks: RegionMarks;
  /** Адрес открытия, ждущего экземпляра; есть — область в `loading`. */
  loading: AddressJson | undefined;
  /** Жетон последнего начатого открытия или очистки. */
  ticket: number;
  /** Жетон идущего перечитывания по сигналу. */
  refresh: number | undefined;
  /** Жетон идущего восстановления по новому соединению. */
  resync: number | undefined;
  /**
   * Данные слота прочитаны по прежнему соединению или ждут соединения:
   * состояние — `stale: 'offline'`, действия отключены (D-UI-74).
   */
  behind: boolean;
};

/**
 * Уведомление во входящих вкладки: `id` уведомления, данные — как пришли,
 * после проверки схемой Def, — и ссылки. Текста нет: его строит представление.
 */
export type PageInboxEntry = {
  readonly notification: string;
  readonly data: unknown;
  readonly links: readonly AddressJson[];
};

/**
 * Сборка входящих: набор для поиска Def уведомления, наблюдатель и след для
 * записей `defect`, часы отсева и порт броска слушателя источника.
 */
export type PageInboxSpec = {
  readonly ids: UiIds;
  readonly observer: UiObserver;
  readonly traces: PageTraces;
  readonly clock: PageClock;
  readonly onFault: (error: unknown) => void;
};

/** Отсев повторов: предел ключей и срок ключа (мс) по часам вкладки. */
export type PageSeenKeysSpec = {
  readonly limit: number;
  readonly ttl: number;
  readonly clock: PageClock;
};

/** Снимок экземпляра области в форме JSON: без поля `state`, если его нет. */
export type PageSlotJson = {
  readonly address: AddressJson;
  readonly revision: number;
  readonly state?: unknown;
};

/** Снимок вкладки: области с экземпляром; пустой области в снимке нет. */
export type PageSnapshot = Readonly<
  Partial<Record<PageRegionName, PageSlotJson>>
>;

/** Сообщения сервера, которые разбирают порты исполнителя. */
export type PortMessage =
  | ResultMessage
  | SignalMessage
  | WatchRefusedMessage
  | RefusedMessage;

/** Подписка портов: слушатель исполнителя и адрес — для отвода сигнала. */
export type PortWatch = {
  readonly listener: (signal: RefreshSignal) => void;
  readonly address: AddressJson;
};

/**
 * Переход без связи, ждущий соединения: жетон открытия области, адрес,
 * снимок экземпляра для восстановления (переход по записи истории) и промис
 * вызывающего.
 */
export type DeferredOpen = {
  readonly ticket: number;
  readonly address: Address;
  readonly json?: unknown;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
};

/** Вызов UC, ждущий ответа сервера. */
export type PendingCall = {
  readonly resolve: (result: SerializedResult) => void;
  readonly reject: (error: Error) => void;
};
