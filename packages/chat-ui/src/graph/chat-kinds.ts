import type { GraphKinds } from 'dmg-core/graph';
import {
  CHAT_ENTRY_POINT_PROPS,
  CHAT_ENTRY_PROPS,
  CHAT_MESSENGER_PROPS,
  CHAT_REACTION_PROPS,
  CHAT_SIGNAL_PROPS,
} from './chat-props';

/** Имя поставщика графа общей части мессенджеров; не имя канала приложения. */
export const CHAT_PROVIDER = 'dmg-ui-chat';

/** Версия поставщика графа общей части мессенджеров. */
export const CHAT_VERSION = '0.3.0';

/** Имена видов узлов поставщика `dmg-ui-chat`. */
export const CHAT_NODE_KINDS = {
  messenger: 'chatMessenger',
  entry: 'chatEntry',
  point: 'chatEntryPoint',
  signal: 'chatSignal',
  reaction: 'chatReaction',
} as const;

/** Имена видов рёбер поставщика `dmg-ui-chat`; `opens` занято страничным каналом. */
export const CHAT_EDGE_KINDS = {
  enters: 'chatEnters',
  opens: 'chatOpens',
} as const;

/**
 * Виды узлов и рёбер поставщика `dmg-ui-chat`; данные, как `DOMAIN_KINDS`.
 * Рёбра сообщества — виды ядра (`invokes`, `notifiedBy`, `reads`).
 */
export const CHAT_KINDS: GraphKinds = {
  nodes: [
    {
      kind: CHAT_NODE_KINDS.messenger,
      label: 'Мессенджер приложения',
      description:
        'Возможности мессенджера приложения UI: правка, лимиты, инициатива, сообщество.',
      props: CHAT_MESSENGER_PROPS,
    },
    {
      kind: CHAT_NODE_KINDS.entry,
      label: 'Вход беседы',
      description:
        'Вход приложения UI, с которого начинается беседа мессенджера.',
      props: CHAT_ENTRY_PROPS,
    },
    {
      kind: CHAT_NODE_KINDS.point,
      label: 'Точка входа',
      description:
        'Способ попасть на вход беседы; способ и ключ — слова пакета мессенджера.',
      props: CHAT_ENTRY_POINT_PROPS,
    },
    {
      kind: CHAT_NODE_KINDS.signal,
      label: 'Сигнал сообщества',
      description:
        'Сигнал мессенджера о группе, вызывающий объявленный command UC.',
      props: CHAT_SIGNAL_PROPS,
    },
    {
      kind: CHAT_NODE_KINDS.reaction,
      label: 'Реакция сообщества',
      description:
        'Операция мессенджера над группой по событию домена; цель — из выхода query UC.',
      props: CHAT_REACTION_PROPS,
    },
  ],
  edges: [
    {
      kind: CHAT_EDGE_KINDS.enters,
      label: 'Открывает экран',
      description: 'Вход беседы открывает экран входа приложения UI.',
    },
    {
      kind: CHAT_EDGE_KINDS.opens,
      label: 'Открывает вход',
      description: 'Точка входа открывает вход беседы приложения UI.',
    },
  ],
};
