import type { Identified, Trace } from 'dmg-core';
import type {
  ActionField,
  AddressJson,
  AnyUiAppDef,
  CodeLoaders,
  RenderContext,
  ScreenRuntime,
  UiObserver,
} from 'dmg-ui';
import type {
  PersonPlaces,
  RecipientCallers,
  ServerContext,
  UiServer,
} from 'dmg-ui/server';
import type { Message } from '../message/message.types';
import type {
  MessageHandle,
  MessengerPort,
} from '../messenger/messenger.types';
import type { ChatViews } from '../view/chat-views';
import type { ConversationStore } from './conversation-store.types';

// Данные беседы — простые объекты JSON, классы работают над ними: сигналы
// мессенджера, записи таблицы ссылок, снимок беседы; спеки беседы и узла
// бесед. Таблица ссылок — D-UI-44, снимок —
// D-UI-45.

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
  /** Собеседник — ключ беседы; непрозрачная строка мессенджера; не пустая, до `MAX_PEER_LENGTH` символов. */
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
  | (SignalHead & { readonly kind: 'cancel' })
  /** «Назад» собеседника: у мессенджеров — команда или жест, не нажатие варианта. */
  | (SignalHead & { readonly kind: 'back' });

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
    }
  /** «Назад» живого экрана `screen`: с другого экрана — «Экран уже закрыт.». */
  | {
      readonly ref: string;
      readonly kind: 'back';
      readonly screen: Serial;
      readonly label: string;
    }
  | { readonly ref: string; readonly kind: 'home'; readonly label: string };

/** Запись шага черновика: вариант поля, «Пропустить», «Ещё» вариантов поля. */
export type StepEntry =
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
      readonly of: 'field';
      readonly owner: Serial;
      readonly page: number;
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
    }
  | { readonly kind: 'back'; readonly screen: Serial; readonly label: string }
  | { readonly kind: 'home'; readonly label: string };

/** Живое место беседы в снимке: сообщения последнего показа, положение, след и последнее сообщение. */
export type PlaceJson = {
  /** Сообщения живого места — последнего показа вида или шага, по порядку. */
  readonly handles: readonly MessageHandle[];
  /** Живое место последнее в беседе; нет — нет. */
  readonly latest?: boolean;
  /** SHA-256 (hex) ключа следа в истории, если место показывает вид экрана со следом. */
  readonly history?: string;
  /** Последнее сообщение места со ссылками — для `retire` после перезапуска. */
  readonly message?: Message;
};

/** Живой экран беседы в снимке. */
export type LiveScreenJson = {
  readonly serial: Serial;
  /** Снимок экземпляра ядра как есть: адрес, состояние и ревизию проверяет `ScreenRuntime.restore`. */
  readonly instance: unknown;
  /** Отпечаток вида, показанного последним (`ScreenFingerprint`). */
  readonly shown: string;
  /** Страница вариантов экрана при листании. */
  readonly page: number;
} & PlaceJson;

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
  /** Ключи отсева уведомлений (SHA-256 hex), не больше `MAX_NOTIFIED`, старые первыми; пустой — поля нет. */
  readonly notified?: readonly string[];
  readonly screen?: LiveScreenJson;
  readonly draft?: DraftJson;
  /**
   * Путь переходов: снимки экземпляров ядра, старые первыми, не больше
   * `MAX_PATH`; состояние экранов — данные собеседника. Пустой путь — поля нет.
   */
  readonly path?: readonly unknown[];
};

/** Раскладка вариантов под лимит мессенджера (`OptionLayout`). */
export type Layout =
  /** Все варианты — кнопками. */
  | { readonly kind: 'all' }
  /** Кнопки страницы и «Ещё» по кругу. */
  | { readonly kind: 'pages'; readonly size: number; readonly count: number }
  /** Номера в тексте и «Ещё», если страниц больше одной. */
  | { readonly kind: 'numbers'; readonly size: number; readonly count: number };

/** След на каждый сигнал беседы. */
export type SignalTraces = {
  next(): Trace;
};

/** Контекст рендера личности беседы на сигнал. */
export type ConversationContexts = {
  context(trace: Trace): Promise<RenderContext>;
};

/** Всё, что нужно одной беседе одного собеседника; собирает узел бесед. */
export type ConversationSpec = {
  readonly app: AnyUiAppDef;
  readonly runtime: ScreenRuntime;
  readonly contexts: ConversationContexts;
  readonly traces: SignalTraces;
  /** Представления приложения мессенджера; сборщик показа строит беседа. */
  readonly views: ChatViews;
  /** У узла бесед — `LimitedMessenger`. */
  readonly messenger: MessengerPort;
  readonly logger: ServerContext['logger'];
  readonly peer: string;
  /** uuid владельца беседы. */
  readonly person: string;
  /** Вход «в начало»: после выхода, отказа адреса и невосстановленного экрана. */
  readonly home: string;
  /** Эпоха ссылок на каждое воплощение беседы. */
  readonly epochs: () => string;
  /** Проактивный показ отработал: узел бесед пишет снимок; без обработчика беседа живёт без узла. */
  readonly shown?: () => void;
};

/** Узел бесед одного приложения мессенджера. */
export type ConversationsSpec<U extends Identified> = {
  readonly app: AnyUiAppDef;
  readonly codes: CodeLoaders;
  readonly server: UiServer<U>;
  readonly views: ChatViews;
  readonly observer: UiObserver;
  /** Узел сам оборачивает порт в `LimitedMessenger`. */
  readonly messenger: MessengerPort;
  /** Одно хранилище — на одно приложение мессенджера. */
  readonly store: ConversationStore;
  readonly logger: ServerContext['logger'];
  /** Личность транспорта → uuid; не знаем — `undefined`. Единственный источник личности. */
  readonly people: (sender: string) => Promise<string | undefined>;
  /** uuid → собеседник в этом мессенджере (личный чат); нет — `undefined`. Обратный к `people`. */
  readonly peers: (person: string) => Promise<string | undefined>;
  readonly callers: RecipientCallers<U>;
  readonly places: PersonPlaces;
  /** Вход «в начало»; по умолчанию `start`. */
  readonly home?: string;
  /** Бесед в памяти; по умолчанию 1000. */
  readonly limit?: number;
  /** Id запросов следа; по умолчанию — `crypto.randomUUID`. */
  readonly requestIds?: () => string;
  /** Эпохи ссылок; по умолчанию — случайные. */
  readonly epochs?: () => string;
};
