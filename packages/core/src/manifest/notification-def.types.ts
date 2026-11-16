import type { AnyEventDef, AnyUseCaseDef, DefSpec, DefTexts } from 'dmg-core';
import type * as v from 'valibot';
import type { NormalizedSchema } from './normalized.types';
import type { NotificationDef } from './notification-def';
import type { AnyScreenDef } from './screen-def.types';

/**
 * Получатели уведомления: `payload` — поля payload с `uuid` получателя;
 * `query` — поля выхода query UC (объект или элементы массива), вызванного
 * системой; `input` — поле входа UC → поле payload. Сверка — правило графа.
 */
export type RecipientsSpec =
  | {
      readonly from: 'payload';
      readonly fields: readonly string[];
    }
  | {
      readonly from: 'query';
      readonly uc: AnyUseCaseDef;
      readonly input: Readonly<Record<string, string>>;
      readonly fields: readonly string[];
    };

/** Получатели в нормализованной форме: UC — именем. */
export type NormalizedRecipients =
  | { readonly from: 'payload'; readonly fields: readonly string[] }
  | {
      readonly from: 'query';
      readonly uc: string;
      readonly input: Readonly<Record<string, string>>;
      readonly fields: readonly string[];
    };

/** Пример уведомления; соответствие схеме проверяет правило графа, а не конструктор. */
export type NotificationExampleSpec = {
  readonly label: string;
  readonly description: string;
  readonly data: unknown;
};

/** Спека уведомления: событие, получатели, чтение от имени получателя. */
export type NotificationSpec = DefSpec & {
  readonly event: AnyEventDef;
  readonly recipients: RecipientsSpec;
  /** Query UC от имени получателя. */
  readonly reads: readonly AnyUseCaseDef[];
  readonly data: v.GenericSchema;
  /** Экраны, на которые ведёт уведомление; thunk — как `to` действия: взаимные ссылки иначе падают при импорте. */
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
  readonly recipients: NormalizedRecipients;
  readonly reads: readonly string[];
  readonly data: NormalizedSchema;
  readonly links: readonly string[];
  /** Имена примеров. */
  readonly examples: readonly string[];
};
