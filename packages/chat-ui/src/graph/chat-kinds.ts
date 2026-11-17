import type { GraphKinds } from 'dmg-core/graph';
import { CHAT_ENTRY_PROPS, CHAT_MESSENGER_PROPS } from './chat-props';

/** Имя поставщика графа общей части мессенджеров; не имя канала приложения. */
export const CHAT_PROVIDER = 'dmg-ui-chat';

/** Версия поставщика графа общей части мессенджеров. */
export const CHAT_VERSION = '0.1.0';

/** Имена видов узлов поставщика `dmg-ui-chat`. */
export const CHAT_NODE_KINDS = {
  messenger: 'chatMessenger',
  entry: 'chatEntry',
} as const;

/** Имена видов рёбер поставщика `dmg-ui-chat`. */
export const CHAT_EDGE_KINDS = { enters: 'chatEnters' } as const;

/** Виды узлов и рёбер поставщика `dmg-ui-chat`; данные, как `DOMAIN_KINDS`. */
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
  ],
  edges: [
    {
      kind: CHAT_EDGE_KINDS.enters,
      label: 'Открывает экран',
      description: 'Вход беседы открывает экран входа приложения UI.',
    },
  ],
};
