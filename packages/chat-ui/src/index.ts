// Вход dmg-ui/chat-ui: учебный диалоговый канал — зародыш пакета канала
// на публичных входах ядра; сообщение, помощники лимита, порт мессенджера,
// его возможности и страж лимитов; узел бесед, хранилище бесед в памяти и
// схема снимка беседы.

export type {
  Attachment,
  AttachmentKind,
  ConversationSignal,
  ConversationSnapshot,
  ConversationsSpec,
  DraftJson,
  LiveScreenJson,
  RefEntry,
  SignalHead,
} from './conversation/conversation.types';
export { ConversationSnapshotSchema } from './conversation/conversation-snapshot';
export type { ConversationStore } from './conversation/conversation-store.types';
export { Conversations } from './conversation/conversations';
export { MemoryConversationStore } from './conversation/memory-conversation-store';

export {
  DIALOG_CHANNEL,
  type Dialog,
  DialogChannel,
  type DialogChannelSpec,
  DialogGraphProvider,
  type DialogGraphSpec,
  type DialogOption,
  type DialogPlace,
  DialogRenderer,
  type DialogReply,
  DialogViews,
  NotificationPresenter,
  ScreenPresenter,
} from './dialog';
export type { LengthUnit, TextLimit } from './limit/limit.types';
export { TextLength } from './limit/text-length';
export { TextSplitter } from './limit/text-splitter';
export { TextTrimmer } from './limit/text-trimmer';
export type {
  FormattedText,
  Message,
  MessageKind,
  MessageOption,
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
  CommunitySignal,
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
