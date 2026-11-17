import * as v from 'valibot';
import { MessengerCapabilitiesSchema } from '../messenger/capabilities-schema';
import {
  COMMUNITY_OPERATIONS,
  COMMUNITY_SIGNALS,
} from '../messenger/messenger.const';
import type { MessengerCapabilities } from '../messenger/messenger.types';

// Схемы свойств своих узлов поставщика `dmg-ui-chat`; свойства чужих узлов
// (`uiApp` ядра) пакет не читает — входы приложения берутся из Def.

/**
 * Свойства узла `chatMessenger` — возможности как есть, проверка — схемой
 * возможностей. Обёртка нужна виду графа: вход схемы вида — объект, а у
 * `MessengerCapabilitiesSchema` — `unknown`.
 */
export const CHAT_MESSENGER_PROPS = v.custom<MessengerCapabilities>(
  (input) => v.is(MessengerCapabilitiesSchema, input),
  'возможности мессенджера не по схеме',
);

/** Свойства узла `chatEntry` — имя входа приложения UI. */
export const CHAT_ENTRY_PROPS = v.strictObject({ entry: v.string() });

/** Свойства узла `chatEntryPoint` — вход приложения UI и слова пакета мессенджера. */
export const CHAT_ENTRY_POINT_PROPS = v.strictObject({
  entry: v.string(),
  via: v.string(),
  key: v.string(),
});

/** Свойства узла `chatSignal` — вид сигнала сообщества. */
export const CHAT_SIGNAL_PROPS = v.strictObject({
  signal: v.picklist(COMMUNITY_SIGNALS),
});

/** Свойства узла `chatReaction` — операция сообщества, в том числе объявленная без исполнения. */
export const CHAT_REACTION_PROPS = v.strictObject({
  operation: v.picklist(COMMUNITY_OPERATIONS),
});
