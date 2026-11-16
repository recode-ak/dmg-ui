// Публичный вход ядра dmg-ui: манифесты UI, адрес и чистая логика экрана.

export { Address } from './address/address';
export {
  AddressCodec,
  type AddressJson,
  type AddressRejection,
} from './address/address-codec';
export { UiIds } from './address/ui-ids';
export type { NormalizedSchema } from './manifest/normalized.types';
export {
  type AnyNotificationDef,
  type NormalizedNotification,
  NotificationDef,
  type NotificationExampleSpec,
  type NotificationSpec,
  type RecipientsSpec,
} from './manifest/notification-def';
export { RefreshOn } from './manifest/refresh-on';
export { ScreenAction } from './manifest/screen-action';
export {
  type ActionSpec,
  type AnyScreenDef,
  type DataOf,
  type EmptyParams,
  type ExitSpec,
  type InputSchema,
  type InputSchemaOf,
  type ItemTexts,
  type LocalSpec,
  type NormalizedAction,
  type NormalizedExit,
  type NormalizedLocal,
  type NormalizedRefresh,
  type NormalizedScreen,
  type ParamsOf,
  type ParamsSchemaOf,
  type RefreshSpec,
  type ScreenActions,
  ScreenDef,
  type ScreenExampleSpec,
  type ScreenExits,
  type ScreenLocals,
  type ScreenSpec,
  type StateOf,
  type StateSchemaOf,
  type StrictSchema,
} from './manifest/screen-def';
export { type ExitValue, ScreenExit } from './manifest/screen-exit';
export { ScreenLocal } from './manifest/screen-local';
export {
  type AnyStoryDef,
  type NormalizedOutcome,
  type NormalizedStory,
  type OutcomeSpec,
  StoryDef,
  type StorySpec,
} from './manifest/story-def';
export {
  type AnyUiAppDef,
  type EntrySpec,
  type NormalizedEntry,
  type NormalizedUiApp,
  UiAppDef,
  type UiAppSpec,
} from './manifest/ui-app-def';
export {
  type AnyUiModuleDef,
  type NormalizedUiModule,
  UiModuleDef,
  type UiModuleSpec,
} from './manifest/ui-module-def';
export {
  type AnyUiSetDef,
  type NormalizedUiSet,
  UiSetDef,
  type UiSetSpec,
} from './manifest/ui-set-def';
export type { FieldIssue } from './schema/schema-check';
export {
  type ActionField,
  ActionInput,
  type InputRejection,
} from './screen/action-input';
export {
  type Choice,
  type FieldChoices,
  type FieldValues,
  type InputOf,
  type LocalFn,
  type LocalFns,
  ScreenCode,
} from './screen/screen-code';
export {
  type ActionName,
  type LocalName,
  ScreenLogic,
} from './screen/screen-logic';
export type { Transition } from './screen/transition.types';
