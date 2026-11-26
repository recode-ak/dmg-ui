// Вход dmg-ui/chat-ui: узел бесед мессенджера, хранилище бесед в памяти и
// схема снимка беседы; ссылки на экран — порт хранилища, его версия в памяти
// и формат кода (D-UI-127); представления беседы — сообщения с вариантами-
// намерениями, реестр модуля с перекрытием под мессенджер и сборка области;
// сообщение, помощники лимита, порт мессенджера, его возможности и страж
// лимитов; поставщик графа общей части мессенджеров и его имя, рендерер
// примеров, манифесты сообщества и их исполнитель; узел бесед доставляет и
// уведомления.

export {
  Communities,
  type CommunitiesSpec,
} from './community/communities';
export type { CommunityLimits } from './community/communities.types';
export type {
  ChatCommunitySpec,
  ChatReactionSpec,
  ChatReactionTargets,
  ChatSignalField,
  ChatSignalSpec,
} from './community/community.types';
export { LINK_CODE } from './conversation/conversation.const';
export type {
  Attachment,
  AttachmentKind,
  ConversationExit,
  ConversationExits,
  ConversationLinks,
  ConversationSignal,
  ConversationSnapshot,
  ConversationsSpec,
  ConversationTextOverrides,
  DraftJson,
  LinkStore,
  LiveScreenJson,
  RefEntry,
  SignalHead,
} from './conversation/conversation.types';
export { ConversationSnapshotSchema } from './conversation/conversation-snapshot';
export type { ConversationStore } from './conversation/conversation-store.types';
export { Conversations } from './conversation/conversations';
export { MemoryConversationStore } from './conversation/memory-conversation-store';
export { MemoryLinkStore } from './conversation/memory-link-store';

export { DIALOG_CHANNEL, DialogRenderer } from './dialog';
export {
  type ChatAppSpec,
  type ChatEntryPointSpec,
  ChatGraphProvider,
  type ChatGraphSpec,
} from './graph/chat-graph-provider';
export {
  CHAT_EDGE_KINDS,
  CHAT_NODE_KINDS,
  CHAT_PROVIDER,
} from './graph/chat-kinds';
export type { LengthUnit, TextLimit } from './limit/limit.types';
export { TextLength } from './limit/text-length';
export { TextSplitter } from './limit/text-splitter';
export { TextTrimmer } from './limit/text-trimmer';
export type {
  Accent,
  FormattedText,
  Message,
  MessageKind,
  MessageOption,
  Moment,
  MomentShow,
  TextFragment,
  TextMessage,
  TextStyle,
} from './message/message.types';
export { PlainText } from './message/plain-text';
export { type NestedText, TextBuilder } from './message/text-builder';
export { MessengerCapabilitiesSchema } from './messenger/capabilities-schema';
export { LimitedMessenger } from './messenger/limited-messenger';
export { MessageFit } from './messenger/message-fit';
export type {
  CommunityOperation,
  CommunityPort,
  CommunitySignal,
  CommunitySignalKind,
  Delivery,
  Fitted,
  Initiative,
  LimitCut,
  LimitedMessengerSpec,
  LimitName,
  MessageHandle,
  MessengerCapabilities,
  MessengerPort,
  OptionLimits,
  SendOptions,
  Undelivered,
  UndeliveredReason,
  Updated,
} from './messenger/messenger.types';
export { AppChatViews } from './view/app-chat-views';
export { ChatViews } from './view/chat-views';
export { NotificationPresenter } from './view/notification-presenter';
export { ScreenComposer } from './view/screen-composer';
export { ScreenPresenter } from './view/screen-presenter';
export type {
  CaughtTexts,
  HistoryKey,
  NotificationRender,
  ScreenPresenterSpec,
  ScreenRender,
  ScreenText,
  ViewMessage,
  ViewOption,
  ViewOutput,
} from './view/view.types';
export type { ViewKit } from './view/view-kit';
