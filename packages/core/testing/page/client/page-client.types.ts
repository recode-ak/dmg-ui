import type { SerializedResult } from 'dmg-core';
import type {
  AddressJson,
  AnyUiAppDef,
  CodeLoaders,
  FieldIssue,
  InstanceView,
  ScreenInstance,
  UiObserver,
} from 'dmg-ui';
import type {
  RefusedMessage,
  ResultMessage,
  SignalMessage,
  WatchRefusedMessage,
} from '../wire/page-messages.types';
import type { ClientEnd } from '../wire/page-wire.types';
import type { PageViews } from './page-views';

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
};

/** Значения формы по именам полей — строки, как у формы страницы. */
export type PageFormValues = Readonly<Record<string, string>>;

/** Ожидающее подтверждение области — то, что видит пользователь. */
export type PageConfirm = {
  readonly action: string;
  readonly label: string;
  readonly description: string;
};

/** Подтверждение с тем, что нужно для повтора входа с `confirmed: true`. */
export type PendingConfirm = PageConfirm & {
  readonly input: unknown;
  readonly revision: number;
};

/** Отметки области после сигнала: заметка, замечания формы, подтверждение. */
export type RegionMarks = {
  readonly note?: string;
  readonly issues?: readonly FieldIssue[];
  readonly confirm?: PendingConfirm;
};

/** Область для теста и рендера: вид экземпляра, отметки и текст. */
export type PageRegionView = {
  readonly view?: InstanceView;
  readonly note?: string;
  readonly issues: readonly FieldIssue[];
  readonly confirm?: PageConfirm;
  /** Текст области, перерисованный по последнему изменению. */
  readonly text: string;
};

/** Одна область: живой экземпляр, отписка его `onChange`, отметки и текст. */
export type RegionSlot = {
  instance: ScreenInstance | undefined;
  unlisten: (() => void) | undefined;
  marks: RegionMarks;
  text: string;
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

/** Вызов UC, ждущий ответа сервера. */
export type PendingCall = {
  readonly resolve: (result: SerializedResult) => void;
  readonly reject: (error: Error) => void;
};
