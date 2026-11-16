import type { Result } from 'dmg-core';
import type { ServerContext } from 'dmg-ui/server';
import type { LengthUnit, TextLimit } from '../limit/limit.types';
import type { Message, MessageKind } from '../message/message.types';

// Порт мессенджера (D-UI-37): намерения общей части к собеседнику, способ
// выбирает мессенджер; возможности мессенджера и разрезы стража лимитов.

/** Идентификатор показанного сообщения: выдаёт мессенджер, общая часть хранит как есть (JSON). */
export type MessageHandle = string;

/** Причина недоставки — без данных. */
export type UndeliveredReason =
  /** Нет права писать первым сейчас. */
  | 'window'
  /** Собеседник недоступен (запретил, удалён). */
  | 'blocked'
  /** Мессенджер отверг сообщение (форма, лимит) — дефект показа. */
  | 'rejected'
  /** Сбой транспорта или предел частоты — временно. */
  | 'unavailable';

/** Недоставка: только причина. */
export type Undelivered = { readonly reason: UndeliveredReason };

/** Итог операции порта: значение или недоставка. */
export type Delivery<T> = Result<T, Undelivered>;

/** Признаки отправки. */
export type SendOptions = {
  /** Не ответ на сигнал собеседника, а по инициативе (перечитывание по событию). */
  readonly initiative?: boolean;
};

/** Итог `update`: handle сообщения на экране и была ли правка на месте. */
export type Updated = {
  readonly handle: MessageHandle;
  readonly edited: boolean;
};

/** Право писать первым. */
export type Initiative =
  /** Писать первым можно всегда. */
  | { readonly kind: 'always' }
  /** После первого входящего — всегда. */
  | { readonly kind: 'afterContact' }
  /** Окно после последнего входящего, мс. */
  | { readonly kind: 'window'; readonly ms: number };

/** Лимиты вариантов сообщения. */
export type OptionLimits = {
  /** Вариантов в сообщении. */
  readonly max: number;
  /** Подпись варианта. */
  readonly label: TextLimit;
  /** Короткая ссылка, символов ASCII (ссылки общей части — `[a-z0-9]`). */
  readonly ref: number;
};

/** Сигнал сообщества (место; порт сообщества отдельный). */
export type CommunitySignal = 'joined' | 'left' | 'added' | 'removed';

/** Операция сообщества (место; порт сообщества отдельный). */
export type CommunityOperation =
  | 'exclude'
  | 'invite'
  | 'approve'
  | 'inviteLink';

/** Возможности мессенджера: JSON-данные, проверяются `MessengerCapabilitiesSchema`. */
export type MessengerCapabilities = {
  /** Имя для лога и графа. */
  readonly name: string;
  /** Виды сообщений, которые мессенджер показывает; содержит `text`. */
  readonly kinds: readonly MessageKind[];
  /** Правит показанное сообщение на месте. */
  readonly edit: boolean;
  /** Текст без вариантов. */
  readonly text: TextLimit;
  /** Текст сообщения с вариантами. */
  readonly textWithOptions: TextLimit;
  readonly options: OptionLimits;
  /** Нет — ответ на нажатие не показывается. */
  readonly pressAnswer?: TextLimit;
  /** Форма целиком (место; не реализуется). */
  readonly form: boolean;
  readonly initiative: Initiative;
  readonly community: {
    readonly signals: readonly CommunitySignal[];
    readonly operations: readonly CommunityOperation[];
  };
};

/** Порт мессенджера: намерения общей части, способ выбирает мессенджер. Недоставка — значение, не бросок. */
export type MessengerPort = {
  readonly capabilities: MessengerCapabilities;
  /** Новое сообщение. */
  show(
    peer: string,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<MessageHandle>>;
  /** Показанное сообщение должно выглядеть так: правка на месте или новое (тогда `edited: false` и новый handle). */
  update(
    peer: string,
    handle: MessageHandle,
    message: Message,
    send?: SendOptions,
  ): Promise<Delivery<Updated>>;
  /** Варианты сообщения больше не действуют: убрать, отключить или ничего; `message` — вид после ухода с прежними вариантами; `chosen` — ref нажатого. */
  retire(
    peer: string,
    handle: MessageHandle,
    message: Message,
    chosen?: string,
  ): Promise<Delivery<void>>;
  /** Нажатие принято (с текстом); ответа нет в возможностях — ничего, итог `ok`. */
  answer(peer: string, press: string, text?: string): Promise<Delivery<void>>;
  /** Уведомление: всегда по инициативе; способ (обычное сообщение, шаблон) — мессенджера. */
  notify(peer: string, message: Message): Promise<Delivery<MessageHandle>>;
};

/** Операция порта — для записи лога стража. */
export type MessengerOperation =
  | 'show'
  | 'update'
  | 'retire'
  | 'answer'
  | 'notify';

/** Имя лимита возможностей. */
export type LimitName =
  | 'text'
  | 'textWithOptions'
  | 'options'
  | 'label'
  | 'pressAnswer';

/** Разрез при подгонке: какой лимит сработал и на какой длине. */
export type LimitCut = {
  readonly limit: LimitName;
  readonly max: number;
  /** У `options` нет. */
  readonly unit?: LengthUnit;
  /** Исходная длина или число вариантов. */
  readonly length: number;
  /** Номер варианта у `label`, с нуля среди оставленных. */
  readonly index?: number;
};

/** Подогнанное значение и разрезы по порядку. */
export type Fitted<T> = {
  readonly value: T;
  readonly cuts: readonly LimitCut[];
};

/** Сборка стража лимитов. */
export type LimitedMessengerSpec = {
  readonly port: MessengerPort;
  readonly logger: ServerContext['logger'];
};
