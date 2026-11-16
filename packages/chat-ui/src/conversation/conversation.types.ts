import type { ActionField, AddressJson } from 'dmg-ui';
import type { FormattedText } from '../message/message.types';
import type { MessageHandle } from '../messenger/messenger.types';

// Данные беседы: сигналы мессенджера, записи таблицы ссылок (D-UI-44),
// снимок беседы (D-UI-45) и показанный вид для отпечатка. Всё — простые
// объекты JSON; классы работают над ними.

/** Вид вложения: только место, до действия не доводится. */
export type AttachmentKind = 'file' | 'audio' | 'image' | 'video';

/** Вложение: вид и непрозрачный идентификатор содержимого у мессенджера. */
export type Attachment = {
  readonly kind: AttachmentKind;
  readonly handle: string;
};

/** Общая часть каждого сигнала. */
export type SignalHead = {
  /** Идентификатор для отсева повтора: уникален у мессенджера; до `MAX_SIGNAL_ID` символов. */
  readonly id: string;
  /** Собеседник — ключ беседы; непрозрачная строка мессенджера. */
  readonly peer: string;
  /** Личность транспорта отправителя; uuid даёт порт проекта `people`. */
  readonly sender: string;
};

/** Сигнал беседы: данные, которые мессенджер строит из своего апдейта. */
export type ConversationSignal =
  | (SignalHead & {
      readonly kind: 'enter';
      readonly entry: string;
      /** Место под параметр точки входа; пока никуда не передаётся. */
      readonly param?: string;
    })
  | (SignalHead & { readonly kind: 'text'; readonly text: string })
  | (SignalHead & {
      readonly kind: 'press';
      readonly ref: string;
      /** Идентификатор нажатия для ответа порта; непрозрачен, в лог не идёт. */
      readonly press: string;
    })
  | (SignalHead & {
      readonly kind: 'attachment';
      readonly attachment: Attachment;
    })
  | (SignalHead & { readonly kind: 'cancel' });

/** Номер экрана или черновика беседы: растёт с каждым открытым экраном и начатым черновиком, хранится в снимке. */
export type Serial = number;

/** Значение варианта поля входа. */
export type ChoiceValue = string | number | boolean;

/** Запись таблицы ссылок: ссылка и цель; экран и черновик — номерами беседы. */
export type RefEntry =
  | {
      readonly ref: string;
      readonly kind: 'action';
      readonly screen: Serial;
      readonly revision: number;
      readonly action: string;
      readonly label: string;
    }
  | {
      readonly ref: string;
      readonly kind: 'local';
      readonly screen: Serial;
      readonly revision: number;
      readonly local: string;
      readonly label: string;
    }
  | {
      readonly ref: string;
      readonly kind: 'confirm';
      readonly screen: Serial;
      readonly revision: number;
      readonly action: string;
      readonly yes: boolean;
      /** Собранный вход — данные собеседника: только в снимке, не в логе; у действия без полей нет. */
      readonly input?: unknown;
      readonly label: string;
    }
  | {
      readonly ref: string;
      readonly kind: 'choice';
      readonly draft: Serial;
      readonly field: string;
      readonly value: ChoiceValue;
      readonly label: string;
    }
  | {
      readonly ref: string;
      readonly kind: 'skip';
      readonly draft: Serial;
      readonly field: string;
      readonly label: string;
    }
  | {
      readonly ref: string;
      readonly kind: 'page';
      readonly of: 'screen' | 'field';
      readonly owner: Serial;
      readonly page: number;
      readonly label: string;
    }
  | {
      readonly ref: string;
      readonly kind: 'open';
      readonly address: AddressJson;
      readonly label: string;
    };

/** Цель без ссылки — то, что передаётся в `RefTable.add`; варианты те же, что у `RefEntry`. */
export type RefTarget =
  | {
      readonly kind: 'action';
      readonly screen: Serial;
      readonly revision: number;
      readonly action: string;
      readonly label: string;
    }
  | {
      readonly kind: 'local';
      readonly screen: Serial;
      readonly revision: number;
      readonly local: string;
      readonly label: string;
    }
  | {
      readonly kind: 'confirm';
      readonly screen: Serial;
      readonly revision: number;
      readonly action: string;
      readonly yes: boolean;
      readonly input?: unknown;
      readonly label: string;
    }
  | {
      readonly kind: 'choice';
      readonly draft: Serial;
      readonly field: string;
      readonly value: ChoiceValue;
      readonly label: string;
    }
  | {
      readonly kind: 'skip';
      readonly draft: Serial;
      readonly field: string;
      readonly label: string;
    }
  | {
      readonly kind: 'page';
      readonly of: 'screen' | 'field';
      readonly owner: Serial;
      readonly page: number;
      readonly label: string;
    }
  | {
      readonly kind: 'open';
      readonly address: AddressJson;
      readonly label: string;
    };

/** Вариант показанного вида без ссылки: вид и имя цели, подпись. */
export type ShownOption = {
  readonly kind: 'action' | 'local' | 'retry';
  readonly name?: string;
  readonly label: string;
};

/** Что человек видел на экране: текст тела и варианты вида, без заметки перед видом и без ссылок. */
export type ShownScreen = {
  readonly text: FormattedText;
  readonly options: readonly ShownOption[];
};

/** Живой экран беседы в снимке. */
export type LiveScreenJson = {
  readonly serial: Serial;
  /** Снимок экземпляра ядра как есть: адрес, состояние и ревизию проверяет `ScreenRuntime.restore`. */
  readonly instance: unknown;
  /** Отпечаток вида, показанного последним (`ScreenFingerprint`). */
  readonly shown: string;
  /** Сообщения живого экрана у мессенджера — для политик показа. */
  readonly handles: readonly MessageHandle[];
  /** Страница вариантов экрана при листании. */
  readonly page: number;
};

/** Черновик входа в снимке: чьё действие собирается, поля и ответы. */
export type DraftJson = {
  readonly serial: Serial;
  /** Номер экрана, чьё действие собирается. */
  readonly screen: Serial;
  readonly target:
    | {
        readonly kind: 'action';
        readonly action: string;
        readonly revision: number;
      }
    | {
        readonly kind: 'local';
        readonly local: string;
        readonly revision: number;
      };
  /** Поля на момент начала черновика. */
  readonly fields: readonly ActionField[];
  readonly values: Readonly<Record<string, ChoiceValue>>;
  readonly answered: readonly string[];
  /** Страница вариантов текущего поля. */
  readonly page: number;
};

/** Снимок беседы: данные по схеме `ConversationSnapshotSchema`. */
export type ConversationSnapshot = {
  readonly version: 1;
  /** uuid владельца беседы — сверка с личностью сигнала, а не её источник. */
  readonly person: string;
  /** Последний выданный номер экрана и черновика. */
  readonly serial: Serial;
  /** Не больше `MAX_REFS`, старые первыми. */
  readonly refs: readonly RefEntry[];
  /** Не больше `MAX_SEEN`, каждый не длиннее `MAX_SIGNAL_ID`. */
  readonly seen: readonly string[];
  readonly screen?: LiveScreenJson;
  readonly draft?: DraftJson;
};
