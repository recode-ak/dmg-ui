import type {
  AnyEventDef,
  AnyUseCaseDef,
  Caller,
  DomainError,
  Identified,
  Result,
  Trace,
  TraceChannel,
  TraceJson,
} from 'dmg-core';
import type { AppContext } from 'dmg-core/app';
import type { AddressJson } from '../address/address-codec.types';
import type { AnyUiAppDef } from '../manifest/ui-app-def.types';
import type { AnyUiSetDef } from '../manifest/ui-set-def.types';
import type { AppCodeLoaders } from '../runtime/app-code-loaders';
import type { ViewContext } from '../runtime/context.types';
import type { UiObserver } from '../runtime/ui-observer.types';
import type { Place } from '../screen/action-context.types';
import type { UcDispatch } from './ucs-dispatch.types';

/**
 * Источник вызывающего одной сессии канала: личность → `Caller` на каждый
 * вызов с его следом. `subjectId` — субъект для сопоставления событий (у
 * заместителя — замещаемый); `channel` — канал следа вызовов сессии.
 */
export type CallerSource<U extends Identified> = {
  readonly subjectId: string | undefined;
  readonly channel?: TraceChannel;
  resolve(trace: Trace): Promise<Result<Caller<U>, DomainError>>;
};

/**
 * Контекст личности на сервере (D-UI-98): контекст вида и субъект вызывающего
 * в типе проекта — до провода, где субъект становится JSON (D-UI-99).
 */
export type CallerContext<U extends Identified> = ViewContext & {
  readonly subject?: U;
};

/** Вызывающий получателя уведомления по его `uuid` и следу события. */
export type RecipientCallers<U extends Identified> = {
  resolve(uuid: string, trace: Trace): Promise<Result<Caller<U>, DomainError>>;
};

/** Место личности по её uuid на сигнал; источник (профиль, язык транспорта) — проекта. */
export type PersonPlaces = {
  place(uuid: string, trace: Trace): Promise<Place>;
};

/** Уведомление одному получателю; `cause.eventId` — для отсева повторов каналом. */
export type DeliveredNotification = {
  /** `id` уведомления в графе. */
  readonly notification: string;
  readonly recipient: string;
  readonly data: unknown;
  readonly links: readonly AddressJson[];
  readonly cause: { readonly event: string; readonly eventId: string };
  readonly trace: TraceJson;
};

/** Доставка уведомления каналом; сбой — бросок, сервер его логирует. */
export type NotificationDelivery = {
  deliver(notification: DeliveredNotification): Promise<void>;
};

/** Узел канала (сигналы канала): вызывает `uses`, слушает `listens`. */
export type ChannelNode = {
  readonly id: string;
  readonly uses: readonly AnyUseCaseDef[];
  readonly listens: readonly AnyEventDef[];
};

/** Шина и лог приложения, которые нужны серверу UI. */
export type ServerContext = Pick<AppContext, 'bus' | 'logger'>;

/** Сборка `UiServer`: набор, бэкенд вызова, шина и узлы канала. */
export type UiServerSpec<U extends Identified> = {
  readonly set: AnyUiSetDef;
  readonly dispatch: UcDispatch<U>;
  readonly context: ServerContext;
  readonly nodes?: readonly ChannelNode[];
};

/** Сборка `UiNotifier` одного приложения UI. */
export type UiNotifierSpec<U extends Identified> = {
  readonly app: AnyUiAppDef;
  readonly codes: AppCodeLoaders;
  readonly dispatch: UcDispatch<U>;
  readonly callers: RecipientCallers<U>;
  readonly delivery: NotificationDelivery;
  readonly observer: UiObserver;
  readonly context: ServerContext;
};
