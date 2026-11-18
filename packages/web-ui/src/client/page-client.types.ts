import type { SerializedResult } from 'dmg-core';
import type {
  Address,
  AddressJson,
  AnyUiAppDef,
  CodeLoaders,
  FieldIssue,
  RefreshSignal,
  ScreenInstance,
  UiFault,
  UiIds,
  UiObserver,
} from 'dmg-ui';
import type {
  PageConfirm,
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
import type { PageClock } from './page-clock.types';
import type { PageTraces } from './page-traces';
import type { ViewCell } from './view-cell';

/** Области страницы: основная и соседняя. */
export type PageRegionName = 'main' | 'side';

/** Маршрут для клиента — структурно: путь страницы и имя входа приложения UI. */
export type PageRoute = {
  readonly path: string;
  readonly entry: string;
};

/**
 * Сборка вкладки: приложение UI, код экранов, маршруты и клиентский конец
 * провода. `UiServer` клиенту не виден — только провод; представлений клиент
 * не берёт — текст строит цель показа.
 */
export type PageClientSpec = {
  readonly app: AnyUiAppDef;
  readonly codes: CodeLoaders;
  readonly routes: readonly PageRoute[];
  readonly end: ClientEnd;
  readonly observer: UiObserver;
  /** Часы срока отсева повторов; по умолчанию — `PageSystemClock`. */
  readonly clock?: PageClock;
  /** Id запросов следа; по умолчанию — `crypto.randomUUID`. */
  readonly requestIds?: () => string;
  /** Сырые броски кода экранов и слушателей вида — для диагностики. */
  readonly faults?: (fault: UiFault) => void;
};

/** Значения формы по именам полей — строки, как у формы страницы. */
export type PageFormValues = Readonly<Record<string, string>>;

/** Подтверждение с тем, что нужно для повтора входа с `confirmed: true`. */
export type PendingConfirm = PageConfirm & {
  readonly input: unknown;
  readonly revision: number;
};

/** Отметки области после сигнала: заметка, замечания формы, подтверждение, устаревание. */
export type RegionMarks = {
  readonly note?: string;
  readonly issues?: readonly FieldIssue[];
  readonly confirm?: PendingConfirm;
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

/** Снимок вкладки: обе области; пустой области в снимке нет. */
export type PageSnapshot = {
  readonly main?: PageSlotJson;
  readonly side?: PageSlotJson;
};

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
 * Переход без связи, ждущий соединения: жетон открытия области, адрес и
 * промис вызывающего.
 */
export type DeferredOpen = {
  readonly ticket: number;
  readonly address: Address;
  readonly resolve: () => void;
  readonly reject: (error: unknown) => void;
};

/** Вызов UC, ждущий ответа сервера. */
export type PendingCall = {
  readonly resolve: (result: SerializedResult) => void;
  readonly reject: (error: Error) => void;
};
