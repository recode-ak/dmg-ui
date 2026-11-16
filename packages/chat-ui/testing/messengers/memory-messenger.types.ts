import type {
  Message,
  MessageHandle,
  MessengerCapabilities,
  UndeliveredReason,
} from 'dmg-ui/chat-ui';

/** Сборка подставного мессенджера. */
export type MemoryMessengerSpec = {
  readonly capabilities: MessengerCapabilities;
  /** Часы теста, мс; нужны окну инициативы (без таймеров). Нет — часы стоят на 0. */
  readonly clock?: () => number;
};

/** Операция порта — в записи недоставки. */
export type MemoryOperation =
  | 'show'
  | 'update'
  | 'retire'
  | 'answer'
  | 'notify';

/** Запись журнала подставного мессенджера. */
export type MessengerEntry =
  | {
      readonly op: 'sent';
      readonly via: 'show' | 'update' | 'notify';
      readonly peer: string;
      readonly handle: MessageHandle;
      readonly message: Message;
    }
  | {
      readonly op: 'edited';
      readonly peer: string;
      readonly handle: MessageHandle;
      readonly message: Message;
    }
  | {
      readonly op: 'retired';
      readonly peer: string;
      readonly handle: MessageHandle;
      readonly message: Message;
      readonly chosen?: string;
    }
  | {
      readonly op: 'answered';
      readonly peer: string;
      readonly press: string;
      readonly text?: string;
    }
  | {
      readonly op: 'undelivered';
      readonly via: MemoryOperation;
      readonly peer: string;
      readonly reason: UndeliveredReason;
    };
