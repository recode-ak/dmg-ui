import type { SerializedResult } from 'dmg-core';
import type {
  AddressJson,
  AnyUiAppDef,
  CodeLoaders,
  FieldIssue,
  RefreshSignal,
  ScreenInstance,
  UiFault,
  UiObserver,
} from 'dmg-ui';
import type {
  PageConfirm,
  PageStaleReason,
  PageViewState,
} from '../view/page-view-state.types';
import type { PageViews } from '../view/page-views';
import type {
  RefusedMessage,
  ResultMessage,
  SignalMessage,
  WatchRefusedMessage,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import type { ViewCell } from './view-cell';

/** Области страницы: основная и соседняя. */
export type PageRegionName = 'main' | 'side';

/** Маршрут для клиента — структурно: путь страницы и имя входа приложения UI. */
export type PageRoute = {
  readonly path: string;
  readonly entry: string;
};

/**
 * Сборка вкладки: приложение UI, код экранов, представления, маршруты и
 * клиентский конец провода. `UiServer` клиенту не виден — только провод.
 */
export type PageClientSpec = {
  readonly app: AnyUiAppDef;
  readonly codes: CodeLoaders;
  readonly views: PageViews;
  readonly routes: readonly PageRoute[];
  readonly end: ClientEnd;
  readonly observer: UiObserver;
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
 * отметки, адрес идущего открытия и жетоны открытия и перечитывания.
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
  /** Жетон идущего перечитывания; нет — признака `refreshing` нет. */
  refresh: number | undefined;
};

/** Уведомление во входящих вкладки: текст и ссылки. */
export type PageInboxEntry = {
  readonly text: string;
  readonly links: readonly AddressJson[];
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

/** Вызов UC, ждущий ответа сервера. */
export type PendingCall = {
  readonly resolve: (result: SerializedResult) => void;
  readonly reject: (error: Error) => void;
};
