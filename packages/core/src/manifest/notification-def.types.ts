import type { AnyEventDef, AnyUseCaseDef, DefSpec, DefTexts } from 'dmg-core';
import type * as v from 'valibot';
import type { NormalizedSchema } from './normalized.types';
import type { NotificationDef } from './notification-def';
import type { AnyScreenDef } from './screen-def.types';

/**
 * Получатели уведомления — поля payload с `uuid` получателя. Что поля есть
 * в payload — правило Ф3; вариант `from: 'query'` добавит Ф4.
 */
export type RecipientsSpec = {
  readonly from: 'payload';
  readonly fields: readonly string[];
};

/** Пример уведомления; соответствие схеме проверяет правило Ф3 (Т-12). */
export type NotificationExampleSpec = {
  readonly label: string;
  readonly description: string;
  readonly data: unknown;
};

/** Спека уведомления: событие, получатели, чтение от имени получателя. */
export type NotificationSpec = DefSpec & {
  readonly event: AnyEventDef;
  readonly recipients: RecipientsSpec;
  /** Query UC от имени получателя (ФР-6). */
  readonly reads: readonly AnyUseCaseDef[];
  readonly data: v.GenericSchema;
  /** Экраны, на которые ведёт уведомление; thunk — как `to` действия (С-3). */
  readonly links?: () => readonly AnyScreenDef[];
  readonly examples?: Readonly<Record<string, NotificationExampleSpec>>;
};

/** Любой Def уведомления — структурный тип публичных членов. */
export type AnyNotificationDef = {
  readonly [K in keyof NotificationDef]: NotificationDef[K];
};

/** Сериализуемая форма уведомления; ссылки — именами. */
export type NormalizedNotification = DefTexts & {
  readonly dmg: 'notification';
  readonly visible: boolean;
  readonly event: string;
  readonly recipients: RecipientsSpec;
  readonly reads: readonly string[];
  readonly data: NormalizedSchema;
  readonly links: readonly string[];
  /** Имена примеров. */
  readonly examples: readonly string[];
};
