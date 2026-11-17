import type { AnyModuleDef, Identified, SystemCaller } from 'dmg-core';
import type { AnyUiAppDef } from 'dmg-ui';
import type { ServerContext, UcDispatch } from 'dmg-ui/server';
import type { MessengerPort } from '../messenger/messenger.types';
import type {
  ChatCommunitySpec,
  ChatReactionSpec,
  ChatSignalSpec,
} from './community.types';

// Исполнитель сообщества (D-UI-59): сборка `Communities`, пределы отсева и
// манифесты, связанные с модулем-владельцем UC и системным вызывающим узла.

/** Пределы отсева повторов в памяти. */
export type CommunityLimits = {
  /** id сигналов; по умолчанию `MAX_COMMUNITY_SIGNALS`. */
  readonly signals?: number;
  /** Ключей исполненных операций реакций; по умолчанию `MAX_REACTED`. */
  readonly reactions?: number;
};

/** Сборка исполнителя сообщества одного приложения мессенджера. */
export type CommunitiesSpec<U extends Identified> = {
  readonly app: AnyUiAppDef;
  /** Тот же объект, что у графа (`ChatAppSpec.community`). */
  readonly community: ChatCommunitySpec;
  /** Порт сообщества — поле `community`; нужен, если есть реакции. */
  readonly messenger: MessengerPort;
  readonly dispatch: UcDispatch<U>;
  readonly context: ServerContext;
  /** Личность транспорта → uuid; не знаем — `undefined`. Единственный источник личности. */
  readonly people: (member: string) => Promise<string | undefined>;
  /** uuid → личность транспорта в этом мессенджере; нет — `undefined`. */
  readonly members: (person: string) => Promise<string | undefined>;
  /** handle группы → ключ домена сообщества; не знаем — `undefined`. */
  readonly keys: (handle: string) => Promise<string | undefined>;
  /** Ключ домена сообщества → handle группы; нет — `undefined`. */
  readonly handles: (key: string) => Promise<string | undefined>;
  /** Id запросов следа сигнала; по умолчанию — `crypto.randomUUID`. */
  readonly requestIds?: () => string;
  readonly limit?: CommunityLimits;
};

/** Манифест, проверенный сборкой: модуль-владелец UC, `id` узла и вызывающий от узла. */
export type Bound<
  S extends ChatSignalSpec | ChatReactionSpec,
  U extends Identified,
> = {
  readonly spec: S;
  readonly module: AnyModuleDef;
  readonly node: string;
  readonly caller: SystemCaller<U>;
};

/** Чем реакция видна в логе: узел, событие и его id. */
export type ReactionCause = {
  readonly reaction: string;
  readonly event: string;
  readonly eventId: string;
};

/** Цель операции из строки выхода query UC: ключ сообщества и uuid человека. */
export type ReactionTarget = {
  readonly key: string;
  readonly person: string;
};
