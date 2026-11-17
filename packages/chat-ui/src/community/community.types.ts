import type { AnyEventDef, AnyUseCaseDef } from 'dmg-core';
import type {
  CommunityOperation,
  CommunitySignalKind,
} from '../messenger/messenger.types';

// Манифесты сообщества (D-UI-60): сигнал мессенджера вызывает объявленный
// command UC, реакция — цепочка «событие → query UC → операция мессенджера».
// Один объект `ChatCommunitySpec` читают граф и исполнитель.

/** Откуда поле входа UC сигнала: ключ домена сообщества или uuid человека. */
export type ChatSignalField = 'community' | 'person';

/** Сигнал мессенджера → command UC; `input` — поле входа UC → что в него кладётся. */
export type ChatSignalSpec = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly signal: CommunitySignalKind;
  readonly uc: AnyUseCaseDef;
  readonly input: Readonly<Record<string, ChatSignalField>>;
  /** Вызывать UC и для незнакомого человека — без поля человека. */
  readonly strangers?: boolean;
};

/** Поля выхода query UC реакции с целью операции: ключ сообщества и uuid человека. */
export type ChatReactionTargets = {
  readonly community: string;
  readonly person: string;
};

/** Событие домена → query UC → операция мессенджера; `input` — поле входа UC → поле payload события. */
export type ChatReactionSpec = {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly event: AnyEventDef;
  readonly uc: AnyUseCaseDef;
  readonly input: Readonly<Record<string, string>>;
  readonly operation: CommunityOperation;
  /** Поля выхода UC (объект или элементы массива), из которых берётся цель. */
  readonly targets: ChatReactionTargets;
};

/** Манифесты сообщества одного приложения мессенджера. */
export type ChatCommunitySpec = {
  readonly signals?: readonly ChatSignalSpec[];
  readonly reactions?: readonly ChatReactionSpec[];
};
